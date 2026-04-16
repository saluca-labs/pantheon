"""Hash-chain verification (Phase B).

verify_chain_on_boot(engine_factory) walks the most recent N rows per tenant
and re-derives row_hash to detect tampering. On break, emits SECURITY event
to stdout (does NOT abort startup).
"""
from __future__ import annotations

import json
import logging
from typing import Any

from tiresias.proxy.audit_handler import _GENESIS, _compute_row_hash

logger = logging.getLogger("tiresias.chain_verify")

_DEFAULT_WINDOW = 1000


async def verify_chain_on_boot(engine_factory, window: int = _DEFAULT_WINDOW) -> dict[str, Any]:
    """Walk last `window` rows per tenant; re-derive each row_hash.

    Returns a summary dict: {tenants_checked, breaks: [{tenant_id, row_id}...]}.
    Never raises; errors logged at ERROR level.
    """
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession

    summary: dict[str, Any] = {"tenants_checked": 0, "breaks": [], "rows_checked": 0}
    if engine_factory is None:
        return summary

    try:
        engine = await engine_factory()
    except Exception as exc:  # noqa: BLE001
        logger.error("chain_verify_engine_unavailable error=%s", exc)
        return summary

    try:
        async with AsyncSession(engine) as session:
            tenants_res = await session.execute(
                text("SELECT DISTINCT tenant_id FROM _security_audit")
            )
            tenants = [row[0] for row in tenants_res.fetchall()]

            for tenant_id in tenants:
                summary["tenants_checked"] += 1
                break_info = await _verify_one_tenant(session, tenant_id, window)
                if break_info is not None:
                    summary["breaks"].append(break_info)
                    logger.log(
                        45,  # SECURITY
                        "security_audit_chain_break",
                        extra={
                            "event_type": "security_audit.chain_break",
                            "actor_id": "system",
                            "actor_type": "system",
                            "outcome": "failure",
                            "resource_type": "security_audit",
                            "resource_id": str(break_info.get("row_id")),
                            "tenant_id": tenant_id,
                            "break_detail": break_info,
                        },
                    )
    except Exception as exc:  # noqa: BLE001
        logger.error("chain_verify_failed error=%s", exc)

    return summary


async def verify_chain(session, tenant_id: str, window: int = _DEFAULT_WINDOW) -> dict[str, Any]:
    """Verify chain for a single tenant; returns {valid, broken_at_row, rows_checked}."""
    from sqlalchemy import text

    from tiresias.storage.engine import set_tenant_context

    await set_tenant_context(session, tenant_id)
    break_info = await _verify_one_tenant(session, tenant_id, window)
    if break_info is None:
        return {"valid": True, "broken_at_row": None, "tenant_id": tenant_id}
    return {
        "valid": False,
        "broken_at_row": break_info.get("row_id"),
        "tenant_id": tenant_id,
        "detail": break_info,
    }


async def _verify_one_tenant(session, tenant_id: str, window: int) -> dict[str, Any] | None:
    from sqlalchemy import text

    # Pull rows ordered ASC so prev_hash chains naturally.
    result = await session.execute(
        text(
            """
            SELECT id, ts, event_type, actor_id, resource_id, payload,
                   prev_hash, row_hash
            FROM _security_audit
            WHERE tenant_id = :tid
            ORDER BY id DESC
            LIMIT :win
            """
        ),
        {"tid": tenant_id, "win": window},
    )
    rows = list(reversed(result.fetchall()))
    if not rows:
        return None

    # Establish starting prev_hash. If first row in window is genesis
    # (prev_hash == 'genesis' or NULL), we can verify from there; otherwise
    # we must trust the declared prev_hash as the inherited anchor.
    expected_prev = rows[0][6] or _GENESIS

    for r in rows:
        (row_id, ts, event_type, actor_id, resource_id, payload, prev_hash, row_hash) = r
        ts_str = ts.strftime("%Y-%m-%dT%H:%M:%SZ") if hasattr(ts, "strftime") else str(ts)
        payload_json = json.dumps(payload or {}, sort_keys=True, default=str)
        computed = _compute_row_hash(
            prev_hash=prev_hash or _GENESIS,
            event_type=event_type or "",
            ts=ts_str,
            actor_id=actor_id or "",
            resource_id=resource_id or "",
            payload_json=payload_json,
        )
        if (prev_hash or _GENESIS) != expected_prev:
            return {"row_id": row_id, "reason": "prev_hash_mismatch",
                    "expected_prev": expected_prev, "got_prev": prev_hash}
        if computed != row_hash:
            return {"row_id": row_id, "reason": "row_hash_mismatch",
                    "computed": computed, "stored": row_hash}
        expected_prev = row_hash

    return None
