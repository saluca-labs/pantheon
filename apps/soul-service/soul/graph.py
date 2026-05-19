"""
soul/graph.py — Hash-graph v2 node types and density spectrum (SAL-374)

Implements patent §7.9: three enumerated node variants along a memory density
spectrum. Nodes can only transition toward lower density (one-way downgrade).

Node type hierarchy (dense → sparse):
  FULL          all fields present (content, summary, context, topic, hashes)
  CONTEXT (CAN) session_context + topic_hash + hashes; no content/summary
  PURE_GRAPH (PGN) hashes only; used for GDPR erasure and synthetic bridges

The downgrade path (FULL → CAN → PGN) is irreversible and logged.
Graph topology (hash reference arrays) is NEVER modified during a downgrade.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

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
_AUDIT_TABLE = '_node_downgrade_audit'


def _db():
    if not _SUPABASE_AVAILABLE:
        raise RuntimeError("supabase package not installed — graph persistence unavailable")
    if not _SUPABASE_URL or not _SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY env vars required")
    return create_client(_SUPABASE_URL, _SUPABASE_KEY)


# ── Node type enum ────────────────────────────────────────────────────────────

class NodeType(str, Enum):
    """
    Memory node density variants (patent §7.9 density spectrum).

    Values map directly to the node_type field stored in _memories.metadata.
    """
    FULL           = 'full'    # all fields present — default variant
    CONTEXT_ANCHORED = 'context'  # CAN: session_context + topic_hash + hashes
    PURE_GRAPH     = 'graph'   # PGN: hashes only — GDPR erasure terminal state


# ── Internal helpers ──────────────────────────────────────────────────────────

def _topic_hash(topic: str) -> str:
    """SHA-256(topic_keyword) — deterministic topic anchor per §7.9."""
    return hashlib.sha256(topic.strip().lower().encode('utf-8')).hexdigest()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Node lifecycle ────────────────────────────────────────────────────────────

def create_node(
    memory_id: str,
    content: str,
    session_id: str,
    topics: list[str],
    node_type: NodeType = NodeType.FULL,
) -> dict:
    """
    Build a node record dict for insertion into the _memories table.

    Populates fields according to node_type. For PoC, immutable_refs and
    dynamic_refs are empty at creation — callers populate graph edges separately.

    Args:
        memory_id: Pre-assigned UUID for this memory record.
        content: Raw content text (used for FULL nodes; ignored for CAN/PGN).
        session_id: Owning session ID.
        topics: List of topic keywords — primary topic generates the topic_hash anchor.
        node_type: NodeType enum value determining which fields are populated.

    Returns:
        Dict suitable for upsert into _memories (or as a standalone record).
    """
    primary_topic = topics[0] if topics else ''
    th = _topic_hash(primary_topic) if primary_topic else ''
    now = _now_iso()

    # Base fields present in all node types
    node: dict = {
        'id': memory_id,
        'session_id': session_id,
        'node_type': node_type.value,
        'immutable_refs': [],   # populated at write time (up to 7 hash refs)
        'dynamic_refs': [],     # managed by GOS scheduler (up to 7 hash refs)
        'created_at': now,
        'updated_at': now,
    }

    if node_type == NodeType.FULL:
        node.update({
            'content': content,
            'compressed_summary': None,   # populated after compression
            'session_context': session_id,
            'topic_hash': th,
            'topics': topics,
        })

    elif node_type == NodeType.CONTEXT_ANCHORED:
        # CAN: no content or summary; keeps session_context and topic routing
        node.update({
            'content': None,
            'compressed_summary': None,
            'session_context': session_id,
            'topic_hash': th,
            'topics': topics,
        })

    elif node_type == NodeType.PURE_GRAPH:
        # PGN: hash arrays only — no content, no context, no topic
        node.update({
            'content': None,
            'compressed_summary': None,
            'session_context': None,
            'topic_hash': None,
            'topics': [],
        })

    return node


def downgrade_node(
    memory_id: str,
    target_type: NodeType,
    supabase_client: Optional[Client] = None,
) -> None:
    """
    Downgrade a node toward lower density (FULL→CAN or FULL/CAN→PGN).

    Nullifies content fields appropriate to the target type while preserving
    both hash reference arrays (graph topology is never modified). Logs the
    transition to _node_downgrade_audit for compliance traceability.

    Args:
        memory_id: UUID of the memory record to downgrade.
        target_type: Target NodeType (must be lower density than current).
        supabase_client: Optional pre-built client; creates one if None.

    Raises:
        ValueError: If target_type is not a valid downgrade from current type.
    """
    db = supabase_client or _db()

    # Fetch current node type
    res = db.table(_TABLE).select('node_type,metadata').eq('id', memory_id).execute()
    if not res.data:
        raise ValueError(f'Memory {memory_id} not found')

    row = res.data[0]
    current_type_str = (row.get('metadata') or {}).get('node_type') or row.get('node_type', 'full')
    current_type = NodeType(current_type_str)

    # Enforce one-way downgrade ordering
    _order = {NodeType.FULL: 0, NodeType.CONTEXT_ANCHORED: 1, NodeType.PURE_GRAPH: 2}
    if _order[target_type] <= _order[current_type]:
        raise ValueError(
            f'Invalid downgrade: {current_type.value} → {target_type.value} '
            f'(must move toward lower density)'
        )

    # Build update payload based on target type
    updates: dict = {'updated_at': _now_iso()}

    if target_type == NodeType.CONTEXT_ANCHORED:
        # Strip content and summary; keep session_context and topic_hash
        updates['content'] = None
        updates['compressed_summary'] = None

    elif target_type == NodeType.PURE_GRAPH:
        # Strip all semantic fields; retain only hash arrays
        updates['content'] = None
        updates['compressed_summary'] = None
        updates['session_context'] = None
        updates['topic_hash'] = None
        updates['topics'] = []

    # Update node_type in metadata (schema-agnostic approach for PoC)
    meta = row.get('metadata') or {}
    meta['node_type'] = target_type.value
    meta['downgraded_at'] = _now_iso()
    meta['previous_type'] = current_type.value
    updates['metadata'] = meta

    db.table(_TABLE).update(updates).eq('id', memory_id).execute()

    # Write audit log — best-effort (non-fatal if audit table absent)
    try:
        db.table(_AUDIT_TABLE).insert({
            'memory_id': memory_id,
            'from_type': current_type.value,
            'to_type': target_type.value,
            'downgraded_at': _now_iso(),
            'reason': 'gdpr_erasure' if target_type == NodeType.PURE_GRAPH else 'density_reduction',
        }).execute()
    except Exception:
        pass  # audit table may not exist in all deployments


def get_node_type(
    memory_id: str,
    supabase_client: Optional[Client] = None,
) -> NodeType:
    """
    Retrieve the current NodeType of a memory record.

    Args:
        memory_id: UUID of the memory record.
        supabase_client: Optional pre-built client; creates one if None.

    Returns:
        NodeType enum value. Defaults to NodeType.FULL if field is absent.
    """
    db = supabase_client or _db()
    res = db.table(_TABLE).select('node_type,metadata').eq('id', memory_id).execute()
    if not res.data:
        raise ValueError(f'Memory {memory_id} not found')

    row = res.data[0]
    # Prefer metadata.node_type (written by downgrade_node) over column value
    type_str = (row.get('metadata') or {}).get('node_type') or row.get('node_type', 'full')
    return NodeType(type_str)
