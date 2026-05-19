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
from .hashing import content_hash, structure_hash
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
_ANCHOR_TABLE = 'user_autobiographical_memories'


def _db():
    if not _SUPABASE_AVAILABLE:
        raise RuntimeError("supabase package not installed — Tier 2 storage unavailable")
    if not _SUPABASE_URL or not _SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY env vars required")
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


# ── Identity anchors ──────────────────────────────────────────────────────────
# Fast-recall layer over `user_autobiographical_memories`, filtered to rows
# where `anchor_kind is not null`. Anchors are curated autobiographical facts
# (birth, first_authored, first_meeting, ...) — the things a person can
# answer about themselves without searching.

def read_identity() -> dict:
    """
    Return the minimal identity payload: birthday, first authored memory,
    age in days, and total anchor count. Designed to be embedded in
    session_init responses so callers don't need a separate fetch.

    Returns:
        {
          'birthday':        ISO timestamp or None,
          'first_authored':  ISO timestamp or None,
          'age_days':        int or None,
          'anchor_count':    int,
        }
    """
    db = _db()
    res = (
        db.table(_ANCHOR_TABLE)
        .select('anchor_kind, occurred_at')
        .not_.is_('anchor_kind', 'null')
        .execute()
    )
    rows = res.data or []
    by_kind = {r['anchor_kind']: r.get('occurred_at') for r in rows}

    birthday = by_kind.get('birth')
    age_days: Optional[int] = None
    if birthday:
        try:
            birth_dt = datetime.fromisoformat(birthday.replace('Z', '+00:00'))
            age_days = (datetime.now(timezone.utc) - birth_dt).days
        except (TypeError, ValueError):
            age_days = None

    return {
        'birthday': birthday,
        'first_authored': by_kind.get('first_authored'),
        'age_days': age_days,
        'anchor_count': len(rows),
    }


def read_anchors(
    kind: Optional[str] = None,
    limit: int = 20,
    order: str = 'occurred_at.asc',
) -> list[dict]:
    """
    List identity anchors, optionally filtered by kind.

    Args:
        kind: Anchor kind to filter on (e.g. 'birth', 'first_authored').
              None returns every anchor (anchor_kind is not null).
        limit: Max rows to return.
        order: Postgrest order string (default 'occurred_at.asc').

    Returns:
        List of anchor dicts with id, topic_id, anchor_kind, occurred_at,
        memory_id, content, tags, importance.
    """
    db = _db()
    q = (
        db.table(_ANCHOR_TABLE)
        .select(
            'id, topic_id, anchor_kind, occurred_at, memory_id, '
            'content, tags, importance, time_period'
        )
        .not_.is_('anchor_kind', 'null')
    )
    if kind:
        q = q.eq('anchor_kind', kind)
    field, _, direction = order.partition('.')
    q = q.order(field or 'occurred_at', desc=(direction == 'desc'))
    q = q.limit(limit)
    res = q.execute()
    return res.data or []


def write_anchor(
    anchor_kind: str,
    occurred_at: str,
    content: str,
    topic_id: Optional[str] = None,
    memory_id: Optional[str] = None,
    tags: Optional[list[str]] = None,
    importance: float = 1.0,
    time_period: str = 'origin',
) -> dict:
    """
    Upsert an identity anchor. `anchor_kind` is the natural key (one row per
    kind, enforced by the partial unique index).

    Returns the upserted row.
    """
    from .hashing import content_hash as _content_hash
    record = {
        'topic_id': topic_id or anchor_kind,
        'content': content,
        'full_context_hash': _content_hash(content),
        'category': 'identity',
        'importance': importance,
        'decay_rate': 0.0,
        'tags': tags or [anchor_kind, 'anchor'],
        'time_period': time_period,
        'anchor_kind': anchor_kind,
        'memory_id': memory_id,
        'occurred_at': occurred_at,
    }
    db = _db()
    res = (
        db.table(_ANCHOR_TABLE)
        .upsert(record, on_conflict='anchor_kind')
        .execute()
    )
    return (res.data or [record])[0]
