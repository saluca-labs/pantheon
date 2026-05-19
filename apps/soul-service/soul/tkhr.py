"""
soul/tkhr.py — TKHR-Index: Topic-Keyed Hash Routing Index

O(1) topic → memory_ids lookup with real-time personalization weights.

Schema (_memory_topic_index):
  topic_hash    TEXT PRIMARY KEY   -- SHA-256(lowercase(topic_word))  [write-once]
  topic_word    TEXT               -- canonical topic string           [write-once]
  memory_ids    TEXT[]             -- memory UUIDs for this topic      [managed]
  weight        FLOAT DEFAULT 1.0  -- personalization priority         [ADJUSTABLE]
  access_count  INTEGER DEFAULT 0  -- cumulative lookups               [auto]
  last_accessed TIMESTAMPTZ        -- last lookup time                 [auto]
  updated_at    TIMESTAMPTZ        -- last any-field update            [auto]

Weight semantics:
  1.0       neutral baseline (default)
  > 1.0     boosted — user shows active interest
  < 1.0     suppressed — deprioritized for current context
  0.0       fully suppressed (indexed, never returned)
  Range:    [0.0, 5.0] — clamped on all writes
"""

import hashlib
from typing import Optional
try:
    from supabase import create_client, Client
    _SUPABASE_AVAILABLE = True
except ImportError:
    create_client = None  # type: ignore[assignment]
    Client = None  # type: ignore[assignment,misc]
    _SUPABASE_AVAILABLE = False

# ── Supabase client ─────────────────────────────────────────────────────────

import os
_SUPABASE_URL = os.getenv('SUPABASE_URL', '')
_SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY', '')
_TABLE = '_memory_topic_index'

def _db():
    if not _SUPABASE_AVAILABLE:
        raise RuntimeError("supabase package not installed — TKHR persistence unavailable")
    if not _SUPABASE_URL or not _SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY env vars required")
    return create_client(_SUPABASE_URL, _SUPABASE_KEY)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _topic_hash(topic: str) -> str:
    """SHA-256(lowercase(topic)). Deterministic, non-reversible."""
    return hashlib.sha256(topic.strip().lower().encode()).hexdigest()


# ── Write operations ─────────────────────────────────────────────────────────

def index_memory(memory_id: str, topics: list[str]) -> None:
    """
    Register memory_id under each topic in the TKHR-Index.
    Upserts each topic row; appends memory_id to memory_ids[] if not present.

    Called at memory write time (soul.storage.write_memory).
    """
    db = _db()
    for topic in topics:
        thash = _topic_hash(topic)
        # Fetch existing row
        res = db.table(_TABLE).select('memory_ids').eq('topic_hash', thash).execute()
        if res.data:
            existing_ids = res.data[0]['memory_ids'] or []
            if memory_id not in existing_ids:
                updated = existing_ids + [memory_id]
                db.table(_TABLE).update({
                    'memory_ids': updated,
                    'updated_at': 'now()'
                }).eq('topic_hash', thash).execute()
        else:
            db.table(_TABLE).insert({
                'topic_hash':  thash,
                'topic_word':  topic.strip().lower(),
                'memory_ids':  [memory_id],
                'weight':      1.0,
                'access_count': 0,
            }).execute()


def evict_memory(memory_id: str) -> int:
    """
    Remove memory_id from all topic rows.
    Called when a memory is deleted from the cold tier.
    Returns number of topic rows updated.
    """
    db = _db()
    # Fetch all rows containing this memory_id
    res = db.table(_TABLE).select('topic_hash,memory_ids').execute()
    updated = 0
    for row in (res.data or []):
        if memory_id in (row['memory_ids'] or []):
            new_ids = [mid for mid in row['memory_ids'] if mid != memory_id]
            db.table(_TABLE).update({
                'memory_ids': new_ids,
                'updated_at': 'now()'
            }).eq('topic_hash', row['topic_hash']).execute()
            updated += 1
    return updated


# ── Read operations ──────────────────────────────────────────────────────────

def lookup(topic: str) -> list[str]:
    """
    O(1) single-topic lookup.
    Returns memory_ids[] for the topic (empty list if topic not indexed).
    Also triggers record_topic_access() — increments access_count and
    nudges weight +0.05 (capped at 3.0).

    Use for keyword-exact topic retrieval. For semantic retrieval across
    multiple related topics, use lookup_multi() or the HNSW vector index.
    """
    db = _db()
    thash = _topic_hash(topic)
    res = db.table(_TABLE).select('memory_ids').eq('topic_hash', thash).execute()
    if not res.data:
        return []
    # Record access (weight nudge + access_count increment)
    db.rpc('record_topic_access', {'p_topic_hash': thash}).execute()
    return res.data[0]['memory_ids'] or []


def lookup_multi(topics: list[str]) -> list[str]:
    """
    Multi-topic weighted lookup.

    Returns a deduplicated, weight-scored list of memory_ids for all given topics,
    sorted by descending score. A memory that appears under multiple high-weight
    topics surfaces first.

    Score formula:
        score(memory_id) = SUM(weight_i for each topic_i that contains memory_id)

    Also triggers record_topic_access() for each matched topic.
    """
    if not topics:
        return []

    db = _db()
    hashes = [_topic_hash(t) for t in topics]

    res = db.table(_TABLE)\
        .select('topic_hash,memory_ids,weight')\
        .in_('topic_hash', hashes)\
        .execute()

    scores: dict[str, float] = {}
    for row in (res.data or []):
        w = row.get('weight', 1.0)
        for mid in (row.get('memory_ids') or []):
            scores[mid] = scores.get(mid, 0.0) + w
        # Record access for each matched topic
        db.rpc('record_topic_access', {'p_topic_hash': row['topic_hash']}).execute()

    # Sort by score descending, return memory_ids only
    return sorted(scores.keys(), key=lambda x: scores[x], reverse=True)


# ── Weight operations ────────────────────────────────────────────────────────

def set_weight(topic: str, weight: float) -> None:
    """
    Explicit weight override for a topic.
    Clamped to [0.0, 5.0]. Use for direct user preference signals
    or orchestrator-driven context adjustment.

    topic_hash and topic_word are NOT modified (write-once fields).
    """
    db = _db()
    thash = _topic_hash(topic)
    db.rpc('set_topic_weight', {
        'p_topic_hash': thash,
        'p_weight': max(0.0, min(5.0, weight))
    }).execute()


def boost_context(topics: list[str], boost: float = 1.5) -> None:
    """
    Batch-boost a set of topics for the current session context.
    Multiplies current weight by `boost`, capped at 5.0.

    Typical use: call at session start with topics matching the current task.
    Example for a patent session:
        boost_context(['patent', 'claims', 'ids', 'prior art', 'specification'], boost=1.8)
    """
    if not topics:
        return
    db = _db()
    hashes = [_topic_hash(t) for t in topics]
    db.rpc('boost_context_topics', {
        'p_topic_hashes': hashes,
        'p_boost': boost
    }).execute()


def decay_weights(factor: float = 0.95) -> int:
    """
    Drift all non-neutral weights back toward 1.0.
    - weight > 1.0: multiply by factor  (e.g. 2.0 × 0.95 = 1.9)
    - weight < 1.0: divide by factor    (e.g. 0.5 / 0.95 ≈ 0.526)

    Call on session end or via a scheduled job.
    Returns number of rows updated.
    """
    db = _db()
    res = db.rpc('decay_topic_weights', {'p_factor': factor}).execute()
    return res.data or 0


def get_weights(topics: list[str]) -> dict[str, float]:
    """
    Return current weights for a list of topics.
    Returns dict of {topic_word: weight}. Missing topics default to 1.0.
    """
    if not topics:
        return {}
    db = _db()
    hashes = [_topic_hash(t) for t in topics]
    res = db.table(_TABLE)\
        .select('topic_word,weight')\
        .in_('topic_hash', hashes)\
        .execute()
    result = {row['topic_word']: row['weight'] for row in (res.data or [])}
    # Fill missing topics with default 1.0
    for t in topics:
        if t.strip().lower() not in result:
            result[t.strip().lower()] = 1.0
    return result


def top_topics(limit: int = 20) -> list[dict]:
    """
    Return the top N topics by current weight (highest priority first).
    Useful for session introspection: "what topics is the user most focused on?"
    Returns list of {topic_word, weight, access_count, last_accessed}.
    """
    db = _db()
    res = db.table(_TABLE)\
        .select('topic_word,weight,access_count,last_accessed')\
        .order('weight', desc=True)\
        .limit(limit)\
        .execute()
    return res.data or []


# ── Maintenance ───────────────────────────────────────────────────────────────

def reset_weights() -> None:
    """
    Reset all weights to 1.0 (hard reset, not decay).
    Use sparingly — prefer decay_weights() for gradual normalization.
    """
    db = _db()
    db.table(_TABLE).update({'weight': 1.0, 'updated_at': 'now()'}).neq('weight', 1.0).execute()


def stats() -> dict:
    """
    Return index statistics: total topics, total memory_ids indexed,
    weight distribution (min/max/avg), most-accessed topics.
    """
    db = _db()
    res = db.table(_TABLE).select('topic_word,weight,access_count,memory_ids').execute()
    rows = res.data or []
    if not rows:
        return {'total_topics': 0}

    weights = [r['weight'] for r in rows]
    total_ids = sum(len(r.get('memory_ids') or []) for r in rows)
    top_accessed = sorted(rows, key=lambda r: r.get('access_count', 0), reverse=True)[:5]

    return {
        'total_topics':    len(rows),
        'total_memory_ids_indexed': total_ids,
        'weight_min':      min(weights),
        'weight_max':      max(weights),
        'weight_avg':      round(sum(weights) / len(weights), 3),
        'weight_neutral':  sum(1 for w in weights if w == 1.0),
        'weight_boosted':  sum(1 for w in weights if w > 1.0),
        'weight_suppressed': sum(1 for w in weights if w < 1.0),
        'top_accessed':    [
            {'topic': r['topic_word'], 'access_count': r.get('access_count', 0)}
            for r in top_accessed
        ],
    }
