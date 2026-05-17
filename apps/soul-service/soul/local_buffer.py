"""
soul/local_buffer.py — SQLite Active Knowledge Base (Tier 0)

Implements a persistent, local SQLite buffer that sits in front of the
hot (Redis/Firestore) and cold (Supabase/PostgreSQL) tiers. This is the
fastest retrieval path — sub-millisecond, no network, no serialization
overhead beyond a single file read.

Tier architecture:
    Tier 0 — SQLite (this module)     sub-1ms   local file, active session window
    Tier 1 — Redis/Firestore          ~2-5ms    hot cache, recent sessions
    Tier 2 — Supabase/PostgreSQL      ~20-50ms  cold store, full history

Behaviour:
    • Session start: pre-fetch populates SQLite from Tier 1/2 (warm-up).
    • During session: all reads hit SQLite first. Writes fan out to all tiers.
    • Buffer eviction: when buffer exceeds MAX_BUFFER_SIZE, oldest entries
      are promoted to Tier 1 and removed from SQLite (LRU eviction).
    • Session end: buffer is flushed (all entries confirmed in Tier 1/2).
    • Persistence: file survives process exit — next session's pre-fetch
      detects already-warm entries and skips redundant Tier 1/2 fetches.
    • TTL: entries older than ENTRY_TTL_DAYS are expired on open().

Default path: ~/.soul/active_kb.db
Override:     SOUL_BUFFER_PATH environment variable
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

# ── Configuration ─────────────────────────────────────────────────────────────

# Maximum number of memory records kept in the active buffer per session.
# When exceeded, oldest (by last_accessed) are evicted to Tier 1.
MAX_BUFFER_SIZE: int = int(os.getenv("SOUL_BUFFER_MAX", "200"))

# Time-to-live for buffer entries: expire records not accessed in N days.
ENTRY_TTL_DAYS: int = int(os.getenv("SOUL_BUFFER_TTL_DAYS", "7"))

# File path for the persistent SQLite database.
DEFAULT_DB_PATH: Path = Path(os.getenv(
    "SOUL_BUFFER_PATH",
    Path.home() / ".soul" / "active_kb.db"
))

# ── Schema ────────────────────────────────────────────────────────────────────

_CREATE_MEMORIES = """
CREATE TABLE IF NOT EXISTS active_memories (
    memory_id       TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL,
    topic_id        TEXT NOT NULL DEFAULT 'general',
    full_context    TEXT NOT NULL DEFAULT '',
    content_hash    TEXT NOT NULL,
    structure_hash  TEXT NOT NULL DEFAULT '',
    node_type       TEXT NOT NULL DEFAULT 'full',
    topics          TEXT NOT NULL DEFAULT '[]',     -- JSON array
    metadata        TEXT NOT NULL DEFAULT '{}',     -- JSON object
    created_at      REAL NOT NULL,                  -- Unix epoch
    last_accessed   REAL NOT NULL                   -- Unix epoch (for LRU eviction)
);
"""

_CREATE_TKHR = """
CREATE TABLE IF NOT EXISTS tkhr_index (
    topic_hash  TEXT NOT NULL,
    topic_word  TEXT NOT NULL,
    memory_id   TEXT NOT NULL,
    weight      REAL NOT NULL DEFAULT 1.0,
    PRIMARY KEY (topic_hash, memory_id)
);
"""

_CREATE_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_session   ON active_memories (session_id);
CREATE INDEX IF NOT EXISTS idx_topic     ON active_memories (topic_id);
CREATE INDEX IF NOT EXISTS idx_accessed  ON active_memories (last_accessed);
CREATE INDEX IF NOT EXISTS idx_created   ON active_memories (created_at);
CREATE INDEX IF NOT EXISTS idx_tkhr_hash ON tkhr_index (topic_hash);
"""

_CREATE_META = """
CREATE TABLE IF NOT EXISTS buffer_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


# ── Connection management ─────────────────────────────────────────────────────

def _ensure_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _open(path: Path = DEFAULT_DB_PATH) -> sqlite3.Connection:
    _ensure_dir(path)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")   # write-ahead log for concurrent reads
    conn.execute("PRAGMA synchronous=NORMAL") # fsync on checkpoint, not every write
    conn.execute("PRAGMA cache_size=-8000")   # 8 MB page cache
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(_CREATE_MEMORIES + _CREATE_TKHR + _CREATE_INDEXES + _CREATE_META)
    conn.commit()
    return conn


@contextmanager
def _conn(path: Path = DEFAULT_DB_PATH) -> Iterator[sqlite3.Connection]:
    """Context manager that opens a connection and commits/rolls back."""
    conn = _open(path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── TTL expiry ────────────────────────────────────────────────────────────────

def expire_old_entries(
    path: Path = DEFAULT_DB_PATH,
    ttl_days: int = ENTRY_TTL_DAYS,
) -> int:
    """
    Delete buffer entries not accessed within ttl_days. Returns deleted count.
    Called automatically on buffer open in the ActiveBuffer class.
    """
    cutoff = time.time() - ttl_days * 86400
    with _conn(path) as conn:
        cursor = conn.execute(
            "DELETE FROM active_memories WHERE last_accessed < ?", (cutoff,)
        )
        deleted = cursor.rowcount
        # Clean up orphaned TKHR entries
        conn.execute(
            "DELETE FROM tkhr_index WHERE memory_id NOT IN "
            "(SELECT memory_id FROM active_memories)"
        )
    return deleted


# ── Core read/write ───────────────────────────────────────────────────────────

def buffer_write(
    memory_id: str,
    session_id: str,
    content: str,
    content_hash_val: str,
    structure_hash_val: str,
    topics: list[str],
    topic_id: str = "general",
    node_type: str = "full",
    metadata: Optional[dict] = None,
    created_at: Optional[float] = None,
    path: Path = DEFAULT_DB_PATH,
) -> None:
    """
    Write a memory record to the SQLite active buffer.

    If the record already exists (same memory_id), updates last_accessed and
    refreshes content — this handles the case where a hot-tier record is
    re-warm-loaded on session start.
    """
    now = time.time()
    ts = created_at or now

    with _conn(path) as conn:
        conn.execute(
            """
            INSERT INTO active_memories
                (memory_id, session_id, topic_id, full_context, content_hash,
                 structure_hash, node_type, topics, metadata, created_at, last_accessed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(memory_id) DO UPDATE SET
                full_context   = excluded.full_context,
                content_hash   = excluded.content_hash,
                structure_hash = excluded.structure_hash,
                last_accessed  = excluded.last_accessed
            """,
            (
                memory_id, session_id, topic_id, content,
                content_hash_val, structure_hash_val, node_type,
                json.dumps(topics),
                json.dumps(metadata or {}),
                ts, now,
            ),
        )
        # Update TKHR index for this memory
        for topic in topics:
            topic_hash = hashlib.sha256(topic.encode()).hexdigest()
            conn.execute(
                """
                INSERT INTO tkhr_index (topic_hash, topic_word, memory_id, weight)
                VALUES (?, ?, ?, 1.0)
                ON CONFLICT(topic_hash, memory_id) DO UPDATE SET
                    weight = tkhr_index.weight + 0.1
                """,
                (topic_hash, topic, memory_id),
            )

    _maybe_evict(session_id, path)


def buffer_read(
    session_id: str,
    limit: int = 20,
    topic: Optional[str] = None,
    path: Path = DEFAULT_DB_PATH,
) -> list[dict]:
    """
    Read memories from the active buffer.

    If topic is provided, performs O(1) TKHR lookup — returns only memories
    matching that topic, ordered by weight desc then recency.

    Otherwise returns the most recent `limit` memories for the session,
    ordered oldest-first (consistent with storage.read_memory).

    Also updates last_accessed on returned records (LRU tracking).
    """
    now = time.time()

    with _conn(path) as conn:
        if topic:
            topic_hash = hashlib.sha256(topic.encode()).hexdigest()
            rows = conn.execute(
                """
                SELECT m.*, t.weight
                FROM active_memories m
                JOIN tkhr_index t ON t.memory_id = m.memory_id
                WHERE m.session_id = ? AND t.topic_hash = ?
                ORDER BY t.weight DESC, m.created_at DESC
                LIMIT ?
                """,
                (session_id, topic_hash, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM active_memories
                WHERE session_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (session_id, limit),
            ).fetchall()
            rows = list(reversed(rows))  # return oldest-first

        if not rows:
            return []

        memory_ids = [r["memory_id"] for r in rows]
        placeholders = ",".join("?" * len(memory_ids))
        conn.execute(
            f"UPDATE active_memories SET last_accessed = ? WHERE memory_id IN ({placeholders})",
            [now] + memory_ids,
        )

    return [_row_to_dict(r) for r in rows]


def buffer_get(
    memory_id: str,
    path: Path = DEFAULT_DB_PATH,
) -> Optional[dict]:
    """Fetch a single memory record by ID. Updates last_accessed."""
    now = time.time()
    with _conn(path) as conn:
        row = conn.execute(
            "SELECT * FROM active_memories WHERE memory_id = ?", (memory_id,)
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE active_memories SET last_accessed = ? WHERE memory_id = ?",
                (now, memory_id),
            )
    return _row_to_dict(row) if row else None


def buffer_contains(memory_id: str, path: Path = DEFAULT_DB_PATH) -> bool:
    """Check whether a memory_id exists in the buffer (used by pre-fetch warm-up)."""
    with _conn(path) as conn:
        row = conn.execute(
            "SELECT 1 FROM active_memories WHERE memory_id = ?", (memory_id,)
        ).fetchone()
    return row is not None


def buffer_topic_lookup(
    topic: str,
    session_id: Optional[str] = None,
    limit: int = 20,
    path: Path = DEFAULT_DB_PATH,
) -> list[dict]:
    """
    O(1) TKHR topic lookup against the local buffer.

    SHA-256(topic) → memory_ids lookup, then batch-fetch memory records.
    If session_id is provided, filters to that session only.
    """
    topic_hash = hashlib.sha256(topic.encode()).hexdigest()
    now = time.time()

    with _conn(path) as conn:
        if session_id:
            rows = conn.execute(
                """
                SELECT m.*, t.weight
                FROM active_memories m
                JOIN tkhr_index t ON t.memory_id = m.memory_id
                WHERE t.topic_hash = ? AND m.session_id = ?
                ORDER BY t.weight DESC, m.created_at DESC
                LIMIT ?
                """,
                (topic_hash, session_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT m.*, t.weight
                FROM active_memories m
                JOIN tkhr_index t ON t.memory_id = m.memory_id
                WHERE t.topic_hash = ?
                ORDER BY t.weight DESC, m.created_at DESC
                LIMIT ?
                """,
                (topic_hash, limit),
            ).fetchall()

        if rows:
            ids = [r["memory_id"] for r in rows]
            placeholders = ",".join("?" * len(ids))
            conn.execute(
                f"UPDATE active_memories SET last_accessed = ? WHERE memory_id IN ({placeholders})",
                [now] + ids,
            )

    return [_row_to_dict(r) for r in rows]


def buffer_delete(memory_id: str, path: Path = DEFAULT_DB_PATH) -> bool:
    """Remove a record from the buffer (called on eviction to Tier 1)."""
    with _conn(path) as conn:
        cursor = conn.execute(
            "DELETE FROM active_memories WHERE memory_id = ?", (memory_id,)
        )
        conn.execute(
            "DELETE FROM tkhr_index WHERE memory_id = ?", (memory_id,)
        )
    return cursor.rowcount > 0


def buffer_size(session_id: Optional[str] = None, path: Path = DEFAULT_DB_PATH) -> int:
    """Return current number of records in the buffer (optionally per-session)."""
    with _conn(path) as conn:
        if session_id:
            row = conn.execute(
                "SELECT COUNT(*) FROM active_memories WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        else:
            row = conn.execute("SELECT COUNT(*) FROM active_memories").fetchone()
    return row[0] if row else 0


def buffer_flush(session_id: str, path: Path = DEFAULT_DB_PATH) -> list[dict]:
    """
    Return all buffer records for a session and remove them from the buffer.
    Called at session end to ensure all entries exist in Tier 1/2.
    """
    with _conn(path) as conn:
        rows = conn.execute(
            "SELECT * FROM active_memories WHERE session_id = ?", (session_id,)
        ).fetchall()
        if rows:
            ids = [r["memory_id"] for r in rows]
            placeholders = ",".join("?" * len(ids))
            conn.execute(
                f"DELETE FROM active_memories WHERE memory_id IN ({placeholders})",
                ids,
            )
            conn.execute(
                f"DELETE FROM tkhr_index WHERE memory_id IN ({placeholders})",
                ids,
            )
    return [_row_to_dict(r) for r in rows]


# ── LRU eviction ─────────────────────────────────────────────────────────────

def _maybe_evict(
    session_id: str,
    path: Path = DEFAULT_DB_PATH,
    max_size: int = MAX_BUFFER_SIZE,
) -> list[str]:
    """
    If session buffer exceeds max_size, evict the oldest (LRU) entries.
    Returns list of evicted memory_ids (caller should promote to Tier 1).
    """
    with _conn(path) as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM active_memories WHERE session_id = ?",
            (session_id,),
        ).fetchone()[0]

        if count <= max_size:
            return []

        overflow = count - max_size
        evict_rows = conn.execute(
            """
            SELECT memory_id FROM active_memories
            WHERE session_id = ?
            ORDER BY last_accessed ASC
            LIMIT ?
            """,
            (session_id, overflow),
        ).fetchall()

        evict_ids = [r["memory_id"] for r in evict_rows]
        if evict_ids:
            placeholders = ",".join("?" * len(evict_ids))
            conn.execute(
                f"DELETE FROM active_memories WHERE memory_id IN ({placeholders})",
                evict_ids,
            )
            conn.execute(
                f"DELETE FROM tkhr_index WHERE memory_id IN ({placeholders})",
                evict_ids,
            )

    return evict_ids


# ── Warm-up (pre-fetch integration) ──────────────────────────────────────────

def warm_from_records(
    records: list[dict],
    path: Path = DEFAULT_DB_PATH,
) -> tuple[int, int]:
    """
    Populate the buffer from a list of memory records (e.g. from pre-fetch).

    Skips records already present in the buffer (already-warm check),
    avoiding redundant writes on repeat session starts — this is the key
    benefit of persistent SQLite: subsequent sessions skip cold-tier fetches
    for memories already in the local buffer.

    Args:
        records: List of memory dicts from storage.read_memory() or prefetch.
        path:    SQLite database path.

    Returns:
        (loaded, skipped) counts.
    """
    loaded = 0
    skipped = 0

    for rec in records:
        mid = rec.get("id") or rec.get("memory_id")
        if not mid:
            continue

        if buffer_contains(mid, path):
            # Already warm — touch last_accessed only
            with _conn(path) as conn:
                conn.execute(
                    "UPDATE active_memories SET last_accessed = ? WHERE memory_id = ?",
                    (time.time(), mid),
                )
            skipped += 1
            continue

        content = rec.get("full_context") or rec.get("content") or ""
        meta = rec.get("metadata") or {}
        ch = rec.get("full_context_hash") or meta.get("content_hash") or ""
        sh = meta.get("structure_hash") or ""
        topics_raw = rec.get("topics") or []
        if isinstance(topics_raw, str):
            try:
                topics_raw = json.loads(topics_raw)
            except Exception:
                topics_raw = [topics_raw]

        created_at_raw = rec.get("created_at")
        if isinstance(created_at_raw, str):
            try:
                from datetime import datetime
                created_at_ts = datetime.fromisoformat(
                    created_at_raw.replace("Z", "+00:00")
                ).timestamp()
            except Exception:
                created_at_ts = time.time()
        elif isinstance(created_at_raw, (int, float)):
            created_at_ts = float(created_at_raw)
        else:
            created_at_ts = time.time()

        buffer_write(
            memory_id=mid,
            session_id=rec.get("session_id", ""),
            content=content,
            content_hash_val=ch,
            structure_hash_val=sh,
            topics=topics_raw,
            topic_id=rec.get("topic_id", "general"),
            node_type=rec.get("node_type", "full"),
            metadata=meta,
            created_at=created_at_ts,
            path=path,
        )
        loaded += 1

    return loaded, skipped


# ── Helpers ───────────────────────────────────────────────────────────────────

def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    # Deserialise JSON columns
    for col in ("topics", "metadata"):
        if col in d and isinstance(d[col], str):
            try:
                d[col] = json.loads(d[col])
            except Exception:
                pass
    # Normalise field names to match storage.py convention
    if "memory_id" in d and "id" not in d:
        d["id"] = d["memory_id"]
    return d


# ── ActiveBuffer convenience class ───────────────────────────────────────────

class ActiveBuffer:
    """
    Stateful wrapper around the SQLite active buffer for use within a session.

    Handles:
        - TTL expiry on open
        - Session-scoped reads/writes
        - Eviction tracking (returns evicted IDs so caller can promote to Tier 1)

    Usage:
        buf = ActiveBuffer(session_id="sess-123")
        buf.write(memory_id, content, content_hash, structure_hash, topics)
        records = buf.read(limit=10)
        records = buf.lookup_topic("patents")
        evicted = buf.flush()   # call at session end
    """

    def __init__(
        self,
        session_id: str,
        path: Path = DEFAULT_DB_PATH,
        max_size: int = MAX_BUFFER_SIZE,
        ttl_days: int = ENTRY_TTL_DAYS,
    ) -> None:
        self.session_id = session_id
        self.path = path
        self.max_size = max_size
        self._evicted: list[str] = []

        # Expire old entries on open
        expire_old_entries(path=path, ttl_days=ttl_days)

    def write(
        self,
        memory_id: str,
        content: str,
        content_hash_val: str,
        structure_hash_val: str,
        topics: list[str],
        topic_id: str = "general",
        node_type: str = "full",
        metadata: Optional[dict] = None,
        created_at: Optional[float] = None,
    ) -> list[str]:
        """Write a record; returns list of any memory_ids evicted to make room."""
        before = buffer_size(self.session_id, self.path)
        buffer_write(
            memory_id=memory_id,
            session_id=self.session_id,
            content=content,
            content_hash_val=content_hash_val,
            structure_hash_val=structure_hash_val,
            topics=topics,
            topic_id=topic_id,
            node_type=node_type,
            metadata=metadata,
            created_at=created_at,
            path=self.path,
        )
        evicted = _maybe_evict(self.session_id, self.path, self.max_size)
        self._evicted.extend(evicted)
        return evicted

    def read(self, limit: int = 20, topic: Optional[str] = None) -> list[dict]:
        return buffer_read(self.session_id, limit=limit, topic=topic, path=self.path)

    def lookup_topic(self, topic: str, limit: int = 20) -> list[dict]:
        return buffer_topic_lookup(topic, session_id=self.session_id,
                                   limit=limit, path=self.path)

    def get(self, memory_id: str) -> Optional[dict]:
        return buffer_get(memory_id, path=self.path)

    def contains(self, memory_id: str) -> bool:
        return buffer_contains(memory_id, path=self.path)

    def warm_from(self, records: list[dict]) -> tuple[int, int]:
        """Populate buffer from pre-fetched records. Returns (loaded, skipped)."""
        return warm_from_records(records, path=self.path)

    def size(self) -> int:
        return buffer_size(self.session_id, self.path)

    def flush(self) -> list[dict]:
        """End-of-session flush. Returns all records for Tier 1 promotion."""
        return buffer_flush(self.session_id, self.path)

    @property
    def evicted(self) -> list[str]:
        """Memory IDs evicted during this session (should be promoted to Tier 1)."""
        return list(self._evicted)
