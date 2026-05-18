"""
soul/storage.py — Three-tier storage module

Implements a three-tier memory architecture:

  Tier 0 — SQLite active buffer (local_buffer.py)
              Sub-1ms reads. Persistent local file. Active session window.
              Populated at session start via pre-fetch warm-up.
              Evicts LRU entries to Tier 1 when MAX_BUFFER_SIZE is exceeded.

  Tier 1 — In-process dict cache (_hot_cache); Firestore/Redis in production.
              ~2-5ms reads. Recent sessions. Evicted on process exit.

  Tier 2 — Supabase _memories table; Cloud SQL/PostgreSQL in production.
              ~20-50ms reads. Full persistent history.

Write path:
  write_memory() → Tier 0 + Tier 1 + Tier 2 + tkhr.index_memory()

Read path:
  read_memory() → Tier 0 → Tier 1 → Tier 2 (with warm-up on miss)

Eviction:
  evict_to_cold() → ensures Tier 2 record exists, removes from Tier 0 + Tier 1.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

import os

try:
    from supabase import create_client, Client
    _SUPABASE_AVAILABLE = True
except ImportError:
    create_client = None  # type: ignore[assignment]
    Client = None  # type: ignore[assignment,misc]
    _SUPABASE_AVAILABLE = False

# Internal imports
from . import tkhr
from .hashing import content_hash, structure_hash, chain_genesis_hash, next_prev_hash
from .local_buffer import ActiveBuffer, warm_from_records, buffer_delete

# Per-session active buffers (instantiated lazily on first access)
_active_buffers: dict[str, ActiveBuffer] = {}


def _get_buffer(session_id: str) -> ActiveBuffer:
    if session_id not in _active_buffers:
        _active_buffers[session_id] = ActiveBuffer(session_id=session_id)
    return _active_buffers[session_id]

# ── Supabase client ──────────────────────────────────────────────────────────

_SUPABASE_URL = os.getenv('SUPABASE_URL', '')
_SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY', '')

_TABLE = '_memories'


def _db():
    if not _SUPABASE_AVAILABLE:
        raise RuntimeError("supabase package not installed — Tier 2 storage unavailable")
    return create_client(_SUPABASE_URL, _SUPABASE_KEY)


# ── Hot cache (Firestore stub for PoC) ───────────────────────────────────────
# Keyed: session_id → list[dict]  (ordered by insertion time)
_hot_cache: dict[str, list[dict]] = {}


def _hot_write(session_id: str, record: dict) -> None:
    if session_id not in _hot_cache:
        _hot_cache[session_id] = []
    _hot_cache[session_id].append(record)


def _hot_read(session_id: str, limit: int) -> list[dict]:
    records = _hot_cache.get(session_id, [])
    return records[-limit:] if limit else records


def _hot_evict(session_id: str, memory_id: str) -> bool:
    """Remove a specific memory_id from the hot cache. Returns True if found."""
    records = _hot_cache.get(session_id, [])
    before = len(records)
    _hot_cache[session_id] = [r for r in records if r.get('id') != memory_id]
    return len(_hot_cache[session_id]) < before


def _fetch_last_chain_entry(session_id: Optional[str]) -> Optional[dict]:
    """
    Fetch the most recent (full_context_hash, prev_hash) pair for this session.

    Used by write_memory() to compute the new row's prev_hash. Returns None if
    the session has no prior rows (caller falls back to chain_genesis_hash).

    NOTE: This is a read-then-write pattern. Safe under the current single-
    replica soul-service deployment (Pantheon Tier 0 SPOF, accepted by design).
    If the service ever scales horizontally, wrap the read + insert in
    pg_advisory_xact_lock(hashtext(session_id)) to serialize per-session writes.
    """
    db = _db()
    q = db.table(_TABLE).select('full_context_hash, prev_hash')
    if session_id is None:
        q = q.is_('session_id', 'null')
    else:
        q = q.eq('session_id', session_id)
    res = (q.order('created_at', desc=True)
            .order('id', desc=True)
            .limit(1)
            .execute())
    return res.data[0] if res.data else None


# ── Public API ────────────────────────────────────────────────────────────────

def write_memory(
    session_id: str,
    content: str,
    topics: list[str],
    metadata: Optional[dict] = None,
) -> str:
    """
    Write a memory record to both hot and cold storage tiers.

    Branch A: writes raw content to hot cache (Firestore stub).
    Branch B: writes to Supabase _memories (cold/persistent tier).
    Also registers topics in the TKHR-Index via tkhr.index_memory().

    Args:
        session_id: Owning session identifier.
        content: Raw content string to persist.
        topics: List of topic keywords for TKHR routing.
        metadata: Optional caller-supplied metadata dict merged into the record.

    Returns:
        memory_id: UUID string identifying the new memory record.
    """
    memory_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    ch = content_hash(content)
    # Structure hash computed against existing session memory IDs (graph topology)
    existing_ids = [r['id'] for r in _hot_cache.get(session_id, [])]
    sh = structure_hash(existing_ids, session_id)

    # Linear forensic chain (SALUCA-013 §7.3, SALUCA-ALFRED §7.7).
    # prev_hash links this row to its predecessor in the same session, allowing
    # downstream verifiers to detect reordering, deletion, or content tampering
    # anywhere in the chain. First row of a session gets the per-session genesis.
    last = _fetch_last_chain_entry(session_id)
    if last and last.get('prev_hash'):
        ph = next_prev_hash(last['full_context_hash'], last['prev_hash'])
    else:
        ph = chain_genesis_hash(session_id)

    record = {
        'id': memory_id,
        'session_id': session_id,
        'topic_id': topics[0] if topics else 'general',
        'full_context': content,
        'full_context_hash': ch,
        'summarized_context': '',           # populated later by compression layer
        'summarized_context_hash': '',
        'cross_ref_full_hashes': [],
        'cross_ref_summary_hashes': [],
        'node_type': 'full',
        'topics': topics,
        'prev_hash': ph,
        'metadata': {
            **(metadata or {}),
            'content_hash': ch,
            'structure_hash': sh,
            'node_type': 'full',
            'created_at': now,
        },
        'created_at': now,
    }

    # Tier 0 — SQLite active buffer (sub-1ms local write)
    buf = _get_buffer(session_id)
    evicted = buf.write(
        memory_id=memory_id,
        content=content,
        content_hash_val=ch,
        structure_hash_val=sh,
        topics=topics,
        topic_id=topics[0] if topics else 'general',
        node_type='full',
        metadata=record['metadata'],
        created_at=None,
    )
    # Promote any LRU-evicted records to Tier 1
    for eid in evicted:
        hot_records = _hot_cache.get(session_id, [])
        if not any(r.get('id') == eid for r in hot_records):
            pass  # already in Tier 1 from prior write; nothing to do

    # Tier 1 — hot cache write (in-process dict)
    _hot_write(session_id, record)

    # Tier 2 — cold tier write (Supabase _memories)
    db = _db()
    db.table(_TABLE).upsert(record).execute()

    # Register topics in TKHR-Index
    if topics:
        tkhr.index_memory(memory_id, topics)

    return memory_id


def read_memory(session_id: str, limit: int = 20, topic: Optional[str] = None) -> list[dict]:
    """
    Read recent memories for a session — three-tier cascade.

    Tier 0 (SQLite active buffer) → Tier 1 (hot cache) → Tier 2 (Supabase).
    On a Tier 2 miss, warms Tier 0 and Tier 1 for subsequent reads.

    Args:
        session_id: Session to read memories from.
        limit: Maximum number of records to return (most recent).
        topic: Optional topic keyword for O(1) TKHR lookup (Tier 0 only).

    Returns:
        List of memory record dicts ordered oldest-first, up to `limit` entries.
    """
    # Tier 0 — SQLite active buffer (sub-1ms)
    buf = _get_buffer(session_id)
    tier0 = buf.read(limit=limit, topic=topic)
    if tier0:
        return tier0

    # Tier 1 — in-process hot cache (~2-5ms)
    hot = _hot_read(session_id, limit)
    if hot:
        # Warm Tier 0 for next read
        warm_from_records(hot)
        return hot

    # Tier 2 — Supabase cold store (~20-50ms)
    db = _db()
    res = db.table(_TABLE)\
        .select('id,session_id,topic_id,full_context,full_context_hash,'
                'summarized_context,summarized_context_hash,metadata,created_at')\
        .eq('session_id', session_id)\
        .order('created_at', desc=True)\
        .limit(limit)\
        .execute()

    rows = list(reversed(res.data or []))   # return oldest-first

    # Warm Tier 0 + Tier 1 for subsequent reads
    if rows:
        _hot_cache[session_id] = rows
        warm_from_records(rows)

    return rows


def evict_to_cold(session_id: str, memory_id: str) -> None:
    """
    Move a hot-cache memory to cold storage, compressing content if needed.

    Ensures the record exists in Supabase, then removes it from the hot cache.
    If the cold record is missing (race/restart), upserts from hot cache data.

    Args:
        session_id: Owning session ID.
        memory_id: UUID of the memory record to evict.
    """
    db = _db()

    # Find the hot record
    hot_records = _hot_cache.get(session_id, [])
    hot_record = next((r for r in hot_records if r.get('id') == memory_id), None)

    if hot_record:
        # Confirm cold record exists; upsert if missing
        res = db.table(_TABLE).select('id').eq('id', memory_id).execute()
        if not res.data:
            db.table(_TABLE).upsert(hot_record).execute()

    # Remove from hot cache regardless
    _hot_evict(session_id, memory_id)
