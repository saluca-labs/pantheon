"""Security-audit export + verification endpoints (Phase B).

GET /v1/security-audit/export?from=&to=
    Operator-only. Walks rows in time window, recomputes hashes, returns
    {chain_valid, from, to, rows, verification_metadata}.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tiresias.proxy.chain_verify import verify_chain

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/security-audit", tags=["security-audit"])


def _is_operator(request: Request) -> bool:
    """Operator gate. Honors two paths:
    1) request.state.tenant_tier == 'operator' (set by SaaSAuthMiddleware if license tier is operator)
    2) X-Tiresias-Operator-Token matches TIRESIAS_OPERATOR_TOKEN env (break-glass)
    """
    tier = getattr(request.state, "tenant_tier", None)
    if tier == "operator":
        return True
    expected = os.environ.get("TIRESIAS_OPERATOR_TOKEN", "").strip()
    if expected:
        presented = request.headers.get("x-tiresias-operator-token", "").strip()
        if presented and presented == expected:
            return True
    return False


@router.get("/export")
async def export_security_audit(request: Request, from_: str | None = None, to: str | None = None) -> dict[str, Any]:
    """Export + verify hash chain for a window."""
    from fastapi import Query  # noqa: F401  (implicit via FastAPI parsing)
    from tiresias.proxy.app import get_settings
    from tiresias.storage.engine import get_engine, set_tenant_context

    if not _is_operator(request):
        raise HTTPException(status_code=403, detail="operator_required")

    cfg = get_settings()
    tenant_id = getattr(request.state, "tenant_id", cfg.tenant_id)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="tenant_id_required")

    from_dt = _parse_iso(from_) if from_ else None
    to_dt = _parse_iso(to) if to else None

    engine = await get_engine("__saas__" if cfg.mode == "saas" else tenant_id, cfg.data_root)
    async with AsyncSession(engine) as session:
        await set_tenant_context(session, tenant_id)

        clauses = ["tenant_id = :tid"]
        params: dict[str, Any] = {"tid": tenant_id}
        if from_dt:
            clauses.append("ts >= :from_ts")
            params["from_ts"] = from_dt
        if to_dt:
            clauses.append("ts < :to_ts")
            params["to_ts"] = to_dt

        query = text(
            f"""
            SELECT id, ts, event_type, actor_id, actor_type, outcome,
                   resource_type, resource_id, service, trace_id, request_id,
                   session_id, payload, prev_hash, row_hash
            FROM _security_audit
            WHERE {' AND '.join(clauses)}
            ORDER BY id ASC
            """
        )
        result = await session.execute(query, params)
        rows = result.fetchall()

        verification = await verify_chain(session, tenant_id)

        def _row_to_dict(r: Any) -> dict[str, Any]:
            return {
                "id": r[0],
                "ts": r[1].isoformat() if hasattr(r[1], "isoformat") else str(r[1]),
                "event_type": r[2],
                "actor_id": r[3],
                "actor_type": r[4],
                "outcome": r[5],
                "resource_type": r[6],
                "resource_id": r[7],
                "service": r[8],
                "trace_id": r[9],
                "request_id": r[10],
                "session_id": r[11],
                "payload": r[12],
                "prev_hash": r[13],
                "row_hash": r[14],
            }

        return {
            "chain_valid": verification.get("valid", False),
            "from": from_dt.isoformat() if from_dt else None,
            "to": to_dt.isoformat() if to_dt else None,
            "rows": [_row_to_dict(r) for r in rows],
            "verification_metadata": verification,
            "count": len(rows),
        }


def _parse_iso(s: str) -> datetime:
    # Accept trailing Z
    s = s.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"invalid_timestamp:{s}")
