"""
soul/hashing.py — Dual-integrity hash mapping layer (SAL-371)

Implements the two-hash cryptographic scheme from patent §7.3:
  H(P)  — content hash of raw payload (tamper-evidence)
  H(S)  — structure hash of graph topology (provenance chain)

Both are SHA-256. The pair is stored in the _memories table to allow
independent verification of (a) content fidelity and (b) graph integrity.
"""

import hashlib
from typing import Optional

# ── Supabase client ──────────────────────────────────────────────────────────

import os
try:
    from supabase import create_client, Client
    _SUPABASE_AVAILABLE = True
except ImportError:
    create_client = None  # type: ignore[assignment]
    Client = None  # type: ignore[assignment,misc]
    _SUPABASE_AVAILABLE = False

_SUPABASE_URL = os.getenv('SUPABASE_URL', '')
_SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY', '')

_TABLE = '_memories'


def _db():
    if not _SUPABASE_AVAILABLE:
        raise RuntimeError("supabase package not installed — hashing persistence unavailable")
    return create_client(_SUPABASE_URL, _SUPABASE_KEY)


# ── Core hash functions ───────────────────────────────────────────────────────

def content_hash(text: str) -> str:
    """
    SHA-256 of raw content bytes.

    Args:
        text: Raw content string (full payload or compressed summary).

    Returns:
        64-character lowercase hex digest.
    """
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def structure_hash(memory_ids: list[str], session_id: str) -> str:
    """
    SHA-256 of sorted memory_ids concatenated with session_id.

    Captures graph topology: same memory set in any order produces the same
    hash; adding or removing a node changes the hash detectably.

    Args:
        memory_ids: List of memory UUIDs that form this node's graph neighbors.
        session_id: Session scope — prevents cross-session hash collisions.

    Returns:
        64-character lowercase hex digest.
    """
    sorted_ids = sorted(memory_ids)
    payload = session_id + '|' + ','.join(sorted_ids)
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


def compute_dual_hash(
    memory_id: str,
    content: str,
    memory_ids: list[str],
    session_id: str,
) -> dict:
    """
    Compute both content and structure hashes for a memory record.

    Args:
        memory_id: UUID of the memory being hashed (excluded from its own structure hash).
        content: Raw content string of the memory.
        memory_ids: IDs of related/neighbor memories (graph edges).
        session_id: Owning session ID.

    Returns:
        Dict with keys: content_hash (str), structure_hash (str).
    """
    ch = content_hash(content)
    sh = structure_hash(memory_ids, session_id)
    return {
        'content_hash': ch,
        'structure_hash': sh,
    }


def verify_integrity(
    memory_id: str,
    content: str,
    stored_content_hash: str,
    stored_structure_hash: str,
    memory_ids: list[str],
    session_id: str,
) -> str:
    """
    Verify both hash layers for a memory record.

    Args:
        memory_id: UUID of the memory under verification.
        content: Current raw content string to verify against stored hash.
        stored_content_hash: H(content) stored at write time.
        stored_structure_hash: H(topology) stored at write time.
        memory_ids: Current neighbor IDs (graph edges) to verify topology.
        session_id: Owning session ID.

    Returns:
        "VALID" | "CONTENT_MISMATCH" | "STRUCTURE_MISMATCH"
    """
    if content_hash(content) != stored_content_hash:
        return 'CONTENT_MISMATCH'
    if structure_hash(memory_ids, session_id) != stored_structure_hash:
        return 'STRUCTURE_MISMATCH'
    return 'VALID'


# ── Linear forensic chain (SALUCA-013 §7.3, SALUCA-ALFRED §7.7) ──────────────

GENESIS_PREFIX = "hctp-genesis-v1::"
ORPHAN_KEY = "_orphan_pre_session_id"


def chain_genesis_hash(session_id: Optional[str]) -> str:
    """
    Per-session genesis prev_hash for the linear memory chain.

    Used as the prev_hash of the first memory written into a session. The
    full chain rolls forward from here: each subsequent row's prev_hash is
    derived from the prior row's (full_context_hash, prev_hash) pair.

    Args:
        session_id: Owning session identifier, or None for orphan rows.

    Returns:
        64-character hex SHA-256 digest.
    """
    chain_key = session_id if session_id else ORPHAN_KEY
    return content_hash(GENESIS_PREFIX + chain_key)


def next_prev_hash(prev_content_hash: str, prev_prev_hash: str) -> str:
    """
    Compute prev_hash for a new memory given the prior row in its chain.

    Formula (parent-pointer Merkle, per patent SALUCA-013 §7.3):
        prev_hash[N] = SHA-256(row[N-1].full_context_hash || row[N-1].prev_hash)

    Args:
        prev_content_hash: full_context_hash of the immediately prior row.
        prev_prev_hash:    prev_hash of the immediately prior row.

    Returns:
        64-character hex SHA-256 digest for the new row's prev_hash.
    """
    return content_hash(prev_content_hash + prev_prev_hash)


def update_structure_hashes(
    session_id: str,
    memory_ids: list[str],
    supabase_client: Optional[Client] = None,
) -> int:
    """
    Recompute and store structure hashes for all memories in a session.

    Called after any graph topology change (edge add/remove, GOS rewiring,
    node downgrade). Keeps stored structure hashes consistent with live graph.

    Args:
        session_id: Session scope — only memories in this session are updated.
        memory_ids: Full list of memory UUIDs in this session's graph.
        supabase_client: Optional pre-built client; creates one if None.

    Returns:
        Number of memory records updated.
    """
    db = supabase_client or _db()
    # Fetch all memory IDs in this session
    res = db.table(_TABLE)\
        .select('id,metadata')\
        .eq('session_id', session_id)\
        .execute()
    rows = res.data or []
    updated = 0
    for row in rows:
        sh = structure_hash(memory_ids, session_id)
        # Store in metadata.structure_hash (avoids schema migration for PoC)
        meta = row.get('metadata') or {}
        meta['structure_hash'] = sh
        db.table(_TABLE).update({'metadata': meta}).eq('id', row['id']).execute()
        updated += 1
    return updated
