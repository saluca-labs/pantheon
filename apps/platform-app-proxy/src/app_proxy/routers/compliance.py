"""Compliance API — framework reports, control listings, and gap analysis."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app_proxy.compliance.frameworks import FRAMEWORKS, ControlDefinition
from app_proxy.compliance.mapper import AuditEvent, ComplianceMapper
from app_proxy.main import get_db_engine
from app_proxy.storage.schema import AppProxyAuditLog

router = APIRouter(prefix="/v1/compliance", tags=["compliance"])

_mapper = ComplianceMapper()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _audit_row_to_event(row: AppProxyAuditLog) -> AuditEvent:
    """Convert an ORM audit row to an AuditEvent dataclass."""
    decision = row.policy_decision or "grant"
    has_approval = row.approval_id is not None
    return AuditEvent(
        tool_name=row.tool_name,
        plugin_name=row.plugin_name,
        agent_id=row.agent_id,
        tenant_id=row.tenant_id,
        policy_decision=decision,
        risk_score=0,  # populated from risk scorer context if available
        risk_level="low",
        behavioral_alerts=[],
        has_approval=has_approval,
        approval_status=row.approval_status,
        timestamp=row.created_at,
    )


def _control_to_dict(ctrl: ControlDefinition) -> dict[str, Any]:
    return {
        "id": ctrl.id,
        "name": ctrl.name,
        "framework": ctrl.framework,
        "description": ctrl.description,
        "evidence_criteria": ctrl.evidence_criteria,
    }


def _parse_datetime(value: str) -> datetime:
    """Parse an ISO-8601 date or datetime string."""
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid datetime format: '{value}'. Use ISO-8601 (e.g. 2026-04-01 or 2026-04-01T00:00:00Z).",
        )
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


# ---------------------------------------------------------------------------
# GET /v1/compliance/frameworks
# ---------------------------------------------------------------------------
@router.get("/frameworks")
async def list_frameworks() -> dict[str, Any]:
    """List all supported compliance frameworks with control counts."""
    result = []
    for key, controls in FRAMEWORKS.items():
        result.append({
            "framework": key,
            "display_name": key.upper().replace("_", " "),
            "control_count": len(controls),
            "controls": [c.id for c in controls],
        })
    return {"frameworks": result}


# ---------------------------------------------------------------------------
# GET /v1/compliance/controls
# ---------------------------------------------------------------------------
@router.get("/controls")
async def list_controls(
    framework: str = Query(..., description="Framework key (soc2, nist_ai_rmf, eu_ai_act)"),
) -> dict[str, Any]:
    """List all controls for a specific compliance framework."""
    controls = FRAMEWORKS.get(framework)
    if controls is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown framework '{framework}'. Available: {list(FRAMEWORKS.keys())}.",
        )
    return {
        "framework": framework,
        "control_count": len(controls),
        "controls": [_control_to_dict(c) for c in controls],
    }


# ---------------------------------------------------------------------------
# GET /v1/compliance/report
# ---------------------------------------------------------------------------
@router.get("/report")
async def generate_report(
    framework: str = Query(..., description="Framework key"),
    start: str = Query(..., description="Period start (ISO-8601)"),
    end: str = Query(..., description="Period end (ISO-8601)"),
    tenant_id: Optional[str] = Query(None, description="Filter by tenant"),
) -> dict[str, Any]:
    """Generate a compliance report for a framework and time period.

    Queries audit logs, maps each event to compliance controls, and
    rolls up a per-control status (satisfied / partial / gap).
    """
    if framework not in FRAMEWORKS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown framework '{framework}'. Available: {list(FRAMEWORKS.keys())}.",
        )

    period_start = _parse_datetime(start)
    period_end = _parse_datetime(end)

    # Query audit logs
    engine = get_db_engine()
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    stmt = (
        select(AppProxyAuditLog)
        .where(AppProxyAuditLog.created_at >= period_start)
        .where(AppProxyAuditLog.created_at <= period_end)
        .where(AppProxyAuditLog.deleted_at.is_(None))
    )
    if tenant_id:
        stmt = stmt.where(AppProxyAuditLog.tenant_id == tenant_id)

    stmt = stmt.order_by(AppProxyAuditLog.created_at)

    async with session_factory() as session:
        result = await session.execute(stmt)
        rows = result.scalars().all()

    events = [_audit_row_to_event(r) for r in rows]
    report = _mapper.generate_report(
        events,
        framework,
        tenant_id=tenant_id or "",
        period_start=period_start,
        period_end=period_end,
    )

    return {
        "framework": report.framework,
        "generated_at": report.generated_at.isoformat(),
        "tenant_id": report.tenant_id,
        "period_start": report.period_start.isoformat(),
        "period_end": report.period_end.isoformat(),
        "total_events": report.total_events,
        "controls_satisfied": report.controls_satisfied,
        "controls_partial": report.controls_partial,
        "controls_gap": report.controls_gap,
        "summary": report.summary,
        "mappings": [
            {
                "framework": m.framework,
                "control_id": m.control_id,
                "control_name": m.control_name,
                "evidence_type": m.evidence_type,
                "status": m.status,
                "notes": m.notes,
            }
            for m in report.mappings
        ],
    }


# ---------------------------------------------------------------------------
# GET /v1/compliance/gaps
# ---------------------------------------------------------------------------
@router.get("/gaps")
async def list_gaps(
    framework: str = Query(..., description="Framework key"),
    start: Optional[str] = Query(None, description="Period start (ISO-8601). Defaults to last 30 days."),
    end: Optional[str] = Query(None, description="Period end (ISO-8601). Defaults to now."),
    tenant_id: Optional[str] = Query(None, description="Filter by tenant"),
) -> dict[str, Any]:
    """List controls with gaps or partial compliance for a framework.

    This is the auditor's shortcut: shows only what needs attention.
    """
    if framework not in FRAMEWORKS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown framework '{framework}'. Available: {list(FRAMEWORKS.keys())}.",
        )

    now = datetime.now(timezone.utc)
    period_end = _parse_datetime(end) if end else now
    if start:
        period_start = _parse_datetime(start)
    else:
        from datetime import timedelta
        period_start = now - timedelta(days=30)

    # Query audit logs
    engine = get_db_engine()
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    stmt = (
        select(AppProxyAuditLog)
        .where(AppProxyAuditLog.created_at >= period_start)
        .where(AppProxyAuditLog.created_at <= period_end)
        .where(AppProxyAuditLog.deleted_at.is_(None))
    )
    if tenant_id:
        stmt = stmt.where(AppProxyAuditLog.tenant_id == tenant_id)

    async with session_factory() as session:
        result = await session.execute(stmt)
        rows = result.scalars().all()

    events = [_audit_row_to_event(r) for r in rows]
    report = _mapper.generate_report(
        events,
        framework,
        tenant_id=tenant_id or "",
        period_start=period_start,
        period_end=period_end,
    )

    # Filter to gap and partial only, deduplicate by control_id (worst status)
    control_issues: dict[str, dict[str, Any]] = {}
    for m in report.mappings:
        if m.status in ("gap", "partial"):
            existing = control_issues.get(m.control_id)
            if existing is None or _status_rank(m.status) < _status_rank(existing["status"]):
                control_issues[m.control_id] = {
                    "control_id": m.control_id,
                    "control_name": m.control_name,
                    "evidence_type": m.evidence_type,
                    "status": m.status,
                    "notes": m.notes,
                }

    return {
        "framework": framework,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "total_controls": len(FRAMEWORKS[framework]),
        "gaps": [v for v in control_issues.values() if v["status"] == "gap"],
        "partial": [v for v in control_issues.values() if v["status"] == "partial"],
    }


def _status_rank(status: str) -> int:
    return {"satisfied": 2, "partial": 1, "gap": 0}.get(status, -1)
