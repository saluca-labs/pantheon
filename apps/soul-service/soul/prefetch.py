"""
soul/prefetch.py — Pre-fetch state-loading protocol (SAL-373)

Implements patent §7.5: cold-start session initialization via composite
payload injection. Eliminates GPU overhead of loading raw historical logs
by substituting a fixed-size composite initialization payload.

Payload assembly (patent §7.5, FIG. 3):
    Prompt_init = [G] + [S_global] + [S_latest]

Where:
    G          = execution guardrail parameters (behavioral constraints, role)
    S_global   = current Soul object (global state / recursive compression output)
    S_latest   = most recent compressed summary for this session

Token footprint target: 5–15% of T_max (bounded, O(1) w.r.t. history length).
Integrity is verified against stored hashes before injection (patent §7.3, §7.7).
"""

from __future__ import annotations

import os
from typing import Optional

try:
    from supabase import create_client, Client
    _SUPABASE_AVAILABLE = True
except ImportError:
    create_client = None  # type: ignore[assignment]
    Client = None  # type: ignore[assignment,misc]
    _SUPABASE_AVAILABLE = False

from .hashing import verify_integrity, content_hash
from .local_buffer import warm_from_records

# ── Supabase client ──────────────────────────────────────────────────────────

_SUPABASE_URL = os.getenv('SUPABASE_URL', '')
_SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY', '')

_TABLE = '_memories'

# Default guardrails injected into every session if no persona-specific G is provided
_DEFAULT_GUARDRAILS = (
    "## Execution Guardrails\n"
    "- Operate with strict factual accuracy; do not hallucinate or fabricate.\n"
    "- Maintain the persona parameters encoded in [SOUL] below across all responses.\n"
    "- When uncertain, state uncertainty explicitly rather than confabulating.\n"
    "- Preserve data confidentiality; do not surface raw credentials or PII.\n"
    "- Session continuity is provided by the Soul payload below — treat it as ground truth.\n"
)


def _db():
    if not _SUPABASE_AVAILABLE:
        raise RuntimeError("supabase package not installed — prefetch unavailable")
    if not _SUPABASE_URL or not _SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY env vars required")
    return create_client(_SUPABASE_URL, _SUPABASE_KEY)


def _rough_token_count(text: str) -> int:
    """Approximate token count: ~4 bytes per token (GPT/Claude average)."""
    return max(1, len(text.encode('utf-8')) // 4)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _fetch_global_state(session_id: str, db: Client) -> Optional[dict]:
    """Fetch the most recent Soul (global state object) for this session."""
    res = db.table(_TABLE)\
        .select('id,full_context,full_context_hash,summarized_context,'
                'summarized_context_hash,metadata,created_at')\
        .eq('session_id', session_id)\
        .eq('topic_id', 'soul_global')\
        .order('created_at', desc=True)\
        .limit(1)\
        .execute()
    return res.data[0] if res.data else None


def _fetch_latest_summary(session_id: str, db: Client) -> Optional[dict]:
    """Fetch the most recent compressed summary for this session."""
    res = db.table(_TABLE)\
        .select('id,full_context,full_context_hash,summarized_context,'
                'summarized_context_hash,metadata,created_at')\
        .eq('session_id', session_id)\
        .neq('topic_id', 'soul_global')\
        .order('created_at', desc=True)\
        .limit(1)\
        .execute()
    return res.data[0] if res.data else None


def _verify_record(record: dict, memory_ids: list[str], session_id: str) -> str:
    """Verify dual-hash integrity for a fetched record. Returns status string."""
    meta = record.get('metadata') or {}
    stored_ch = record.get('full_context_hash') or meta.get('content_hash', '')
    stored_sh = meta.get('structure_hash', '')
    content = record.get('full_context') or record.get('summarized_context') or ''

    if not stored_sh:
        # Structure hash not present — verify content only
        actual_ch = content_hash(content)
        return 'VALID' if actual_ch == stored_ch else 'CONTENT_MISMATCH'

    return verify_integrity(
        memory_id=record['id'],
        content=content,
        stored_content_hash=stored_ch,
        stored_structure_hash=stored_sh,
        memory_ids=memory_ids,
        session_id=session_id,
    )


# ── Public API ────────────────────────────────────────────────────────────────

def build_soul_payload(
    session_id: str,
    persona: Optional[str] = None,
) -> str:
    """
    Assemble the composite initialization payload for a session.

    Combines guardrails (G), global Soul (S_global), and the latest compressed
    summary (S_latest) into a single formatted string ready for context injection.

    Args:
        session_id: Session to build the payload for.
        persona: Optional persona instructions to prepend (overrides default guardrails).

    Returns:
        Composite initialization payload string (Prompt_init).
    """
    db = _db()
    guardrails = persona if persona else _DEFAULT_GUARDRAILS

    global_state_record = _fetch_global_state(session_id, db)
    latest_summary_record = _fetch_latest_summary(session_id, db)

    soul_text = (
        global_state_record.get('summarized_context')
        or global_state_record.get('full_context')
        or '[No Soul object found — this may be the first session.]'
    ) if global_state_record else '[No Soul object found — this may be the first session.]'

    latest_text = (
        latest_summary_record.get('summarized_context')
        or latest_summary_record.get('full_context')
        or '[No prior session summary available.]'
    ) if latest_summary_record else '[No prior session summary available.]'

    payload = (
        f"{guardrails}\n\n"
        f"## [SOUL] Global State (Soul Object)\n"
        f"{soul_text}\n\n"
        f"## [RECENT] Latest Session Summary\n"
        f"{latest_text}"
    )

    return payload


def inject_soul(session_id: str, messages: list) -> list:
    """
    Prepend the Soul payload as a system context message to a messages list.

    Verifies integrity of both global state and latest summary records before
    injection. If integrity check fails, marks the system message with a
    warning — does not block injection, as partial state is preferable to
    none.

    Args:
        session_id: Session to load Soul for.
        messages: Existing messages list (list of dicts with 'role'/'content').

    Returns:
        New messages list with Soul system message prepended.
    """
    db = _db()
    global_state_record = _fetch_global_state(session_id, db)
    latest_summary_record = _fetch_latest_summary(session_id, db)

    # Gather memory IDs for structure hash verification
    res = db.table(_TABLE).select('id').eq('session_id', session_id).execute()
    all_ids = [r['id'] for r in (res.data or [])]

    integrity_warnings: list[str] = []

    if global_state_record:
        status = _verify_record(global_state_record, all_ids, session_id)
        if status != 'VALID':
            integrity_warnings.append(f'[INTEGRITY WARNING] Soul global state: {status}')

    if latest_summary_record:
        status = _verify_record(latest_summary_record, all_ids, session_id)
        if status != 'VALID':
            integrity_warnings.append(f'[INTEGRITY WARNING] Latest summary: {status}')

    payload = build_soul_payload(session_id)

    if integrity_warnings:
        warning_block = '\n'.join(integrity_warnings) + '\n\n'
        payload = warning_block + payload

    soul_message = {
        'role': 'system',
        'content': payload,
    }

    return [soul_message] + list(messages)


def cold_start_init(session_id: str) -> dict:
    """
    Full cold-start initialization sequence for a new session.

    Fetches global state, latest summary, verifies dual-hash integrity on both,
    assembles composite payload, and returns initialization bundle.

    Args:
        session_id: Session being initialized.

    Returns:
        Dict with keys:
            payload (str): Composite initialization prompt string.
            token_count (int): Approximate token footprint of the payload.
            integrity_status (str): "VALID" | "CONTENT_MISMATCH" | "STRUCTURE_MISMATCH"
                                    (worst status across all verified records).
            global_state_id (str | None): memory_id of the Soul record used.
            latest_summary_id (str | None): memory_id of the latest summary used.
    """
    db = _db()

    global_state_record = _fetch_global_state(session_id, db)
    latest_summary_record = _fetch_latest_summary(session_id, db)

    # All memory IDs for structure hash verification
    res = db.table(_TABLE).select('id').eq('session_id', session_id).execute()
    all_ids = [r['id'] for r in (res.data or [])]

    # Integrity verification — worst-case status propagates
    _status_order = {'VALID': 0, 'STRUCTURE_MISMATCH': 1, 'CONTENT_MISMATCH': 2}
    overall_status = 'VALID'

    def _worsen(current: str, new: str) -> str:
        return new if _status_order.get(new, 0) > _status_order.get(current, 0) else current

    if global_state_record:
        s = _verify_record(global_state_record, all_ids, session_id)
        overall_status = _worsen(overall_status, s)

    if latest_summary_record:
        s = _verify_record(latest_summary_record, all_ids, session_id)
        overall_status = _worsen(overall_status, s)

    payload = build_soul_payload(session_id)
    token_count = _rough_token_count(payload)

    # Warm the SQLite active buffer (Tier 0) with fetched records.
    # warm_from_records() skips already-present entries — repeat sessions
    # pay near-zero warm-up cost for memories already in the local buffer.
    warm_records = []
    if global_state_record:
        warm_records.append(global_state_record)
    if latest_summary_record:
        warm_records.append(latest_summary_record)
    buffer_loaded, buffer_skipped = warm_from_records(warm_records)

    return {
        'payload': payload,
        'token_count': token_count,
        'integrity_status': overall_status,
        'global_state_id': global_state_record['id'] if global_state_record else None,
        'latest_summary_id': latest_summary_record['id'] if latest_summary_record else None,
        'buffer_loaded': buffer_loaded,
        'buffer_skipped': buffer_skipped,
    }
