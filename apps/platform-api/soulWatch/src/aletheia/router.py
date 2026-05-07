"""
Aletheia Tool Invocation REST API for SoulWatch.
Provides endpoints to query, summarize, and chart tool invocation telemetry.

All endpoints gated to enterprise/mssp tier via require_permission("aletheia:read").
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.database.connection import get_db
from soulWatch.src.database.models import AletheiaToolInvocation
from src.auth.rbac import require_permission

router = APIRouter(
    prefix="/watch/v1/aletheia/tools",
    tags=["aletheia-tools"],
    dependencies=[Depends(require_permission("aletheia:read"))],
)


def _parse_iso(value: Optional[str], label: str) -> Optional[datetime]:
    """Parse an ISO-8601 string or raise 400."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid '{label}' datetime format")


def _serialize_invocation(inv: AletheiaToolInvocation) -> dict:
    """Convert a model instance to a JSON-safe dict."""
    return {
        "id": str(inv.id),
        "tenant_id": str(inv.tenant_id),
        "invocation_id": inv.invocation_id,
        "agent_id": inv.agent_id,
        "timestamp": inv.timestamp.isoformat() if inv.timestamp else None,
        "command": inv.command,
        "args": inv.args,
        "full_command": inv.full_command,
        "working_directory": inv.working_directory,
        "exit_code": inv.exit_code,
        "duration_ms": inv.duration_ms,
        "stdout_bytes": inv.stdout_bytes,
        "stderr_bytes": inv.stderr_bytes,
        "stdout_hash": inv.stdout_hash,
        "stderr_hash": inv.stderr_hash,
        "policy_verdict": inv.policy_verdict,
        "policy_rule_matched": inv.policy_rule_matched,
        "sanitizer_mode": inv.sanitizer_mode,
        "sanitizer_verdict": inv.sanitizer_verdict,
        "patterns_matched": inv.patterns_matched,
        "environment_hash": inv.environment_hash,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
    }


# ---------------------------------------------------------------------------
# GET /invocations  -- list with filters
# ---------------------------------------------------------------------------


@router.get("/invocations")
async def list_invocations(
    tenant_id: str = Query(..., description="Tenant UUID"),
    agent_id: Optional[str] = Query(None),
    command: Optional[str] = Query(None, description="Prefix match on command name"),
    exit_code: Optional[int] = Query(None),
    policy_verdict: Optional[str] = Query(None),
    sanitizer_verdict: Optional[str] = Query(None),
    since: Optional[str] = Query(None, description="ISO-8601 start"),
    until: Optional[str] = Query(None, description="ISO-8601 end"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List tool invocations with filtering and pagination."""
    try:
        tid = uuid.UUID(tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant_id format")

    since_dt = _parse_iso(since, "since") or (datetime.now(timezone.utc) - timedelta(hours=24))
    until_dt = _parse_iso(until, "until") or datetime.now(timezone.utc)

    q = (
        select(AletheiaToolInvocation)
        .where(
            AletheiaToolInvocation.tenant_id == tid,
            AletheiaToolInvocation.timestamp >= since_dt,
            AletheiaToolInvocation.timestamp <= until_dt,
        )
        .order_by(AletheiaToolInvocation.timestamp.desc())
    )

    if agent_id:
        q = q.where(AletheiaToolInvocation.agent_id == agent_id)
    if command:
        q = q.where(AletheiaToolInvocation.command.startswith(command))
    if exit_code is not None:
        q = q.where(AletheiaToolInvocation.exit_code == exit_code)
    if policy_verdict:
        q = q.where(AletheiaToolInvocation.policy_verdict == policy_verdict)
    if sanitizer_verdict:
        q = q.where(AletheiaToolInvocation.sanitizer_verdict == sanitizer_verdict)

    # Total count
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Paginated rows
    rows = (await db.execute(q.offset(offset).limit(limit))).scalars().all()

    return {
        "invocations": [_serialize_invocation(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ---------------------------------------------------------------------------
# GET /invocations/{invocation_id}  -- single detail
# ---------------------------------------------------------------------------


@router.get("/invocations/{invocation_id}")
async def get_invocation(
    invocation_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single tool invocation by invocation_id."""
    result = await db.execute(
        select(AletheiaToolInvocation).where(
            AletheiaToolInvocation.invocation_id == invocation_id
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Tool invocation not found")
    return _serialize_invocation(inv)


# ---------------------------------------------------------------------------
# GET /summary  -- aggregate stats
# ---------------------------------------------------------------------------


@router.get("/summary")
async def tool_summary(
    tenant_id: str = Query(...),
    agent_id: Optional[str] = Query(None),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate summary of tool invocations for a tenant."""
    try:
        tid = uuid.UUID(tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant_id format")

    since_dt = _parse_iso(since, "since") or (datetime.now(timezone.utc) - timedelta(hours=24))
    until_dt = _parse_iso(until, "until") or datetime.now(timezone.utc)

    base_filter = [
        AletheiaToolInvocation.tenant_id == tid,
        AletheiaToolInvocation.timestamp >= since_dt,
        AletheiaToolInvocation.timestamp <= until_dt,
    ]
    if agent_id:
        base_filter.append(AletheiaToolInvocation.agent_id == agent_id)

    # Aggregates in one query
    agg = await db.execute(
        select(
            func.count().label("total"),
            func.count(func.distinct(AletheiaToolInvocation.command)).label("unique_commands"),
            func.count(func.distinct(AletheiaToolInvocation.agent_id)).label("unique_agents"),
            func.avg(AletheiaToolInvocation.duration_ms).label("avg_duration"),
            func.sum(
                case(
                    (AletheiaToolInvocation.policy_verdict == "deny", 1),
                    else_=0,
                )
            ).label("total_denied"),
            func.sum(
                case(
                    (AletheiaToolInvocation.sanitizer_verdict == "block", 1),
                    else_=0,
                )
            ).label("total_sanitizer_blocks"),
            func.sum(
                case(
                    (AletheiaToolInvocation.exit_code > 0, 1),
                    else_=0,
                )
            ).label("total_errors"),
        ).where(*base_filter)
    )
    row = agg.one()
    total = row.total or 0

    # Top commands
    top_cmd = await db.execute(
        select(
            AletheiaToolInvocation.command,
            func.count().label("cnt"),
        )
        .where(*base_filter)
        .group_by(AletheiaToolInvocation.command)
        .order_by(func.count().desc())
        .limit(10)
    )
    top_commands = [{"command": r[0], "count": r[1]} for r in top_cmd.fetchall()]

    # Top agents
    top_agt = await db.execute(
        select(
            AletheiaToolInvocation.agent_id,
            func.count().label("cnt"),
        )
        .where(*base_filter)
        .where(AletheiaToolInvocation.agent_id.isnot(None))
        .group_by(AletheiaToolInvocation.agent_id)
        .order_by(func.count().desc())
        .limit(10)
    )
    top_agents = [{"agent_id": r[0], "count": r[1]} for r in top_agt.fetchall()]

    error_rate = (row.total_errors / total) if total > 0 else 0.0

    return {
        "total_invocations": total,
        "unique_commands": row.unique_commands or 0,
        "unique_agents": row.unique_agents or 0,
        "avg_duration_ms": round(row.avg_duration or 0, 1),
        "total_denied": row.total_denied or 0,
        "total_sanitizer_blocks": row.total_sanitizer_blocks or 0,
        "top_commands": top_commands,
        "top_agents": top_agents,
        "error_rate": round(error_rate, 4),
        "time_range": {
            "since": since_dt.isoformat(),
            "until": until_dt.isoformat(),
        },
    }


# ---------------------------------------------------------------------------
# GET /timeline  -- bucketed counts for charting
# ---------------------------------------------------------------------------

_BUCKET_SECONDS = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "1d": 86400,
}


@router.get("/timeline")
async def tool_timeline(
    tenant_id: str = Query(...),
    agent_id: Optional[str] = Query(None),
    command: Optional[str] = Query(None),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    bucket: str = Query("1h", description="Bucket size: 1m, 5m, 15m, 1h, 1d"),
    db: AsyncSession = Depends(get_db),
):
    """Time-bucketed invocation counts for charting."""
    try:
        tid = uuid.UUID(tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant_id format")

    bucket_secs = _BUCKET_SECONDS.get(bucket)
    if not bucket_secs:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid bucket. Choose from: {', '.join(_BUCKET_SECONDS.keys())}",
        )

    since_dt = _parse_iso(since, "since") or (datetime.now(timezone.utc) - timedelta(hours=24))
    until_dt = _parse_iso(until, "until") or datetime.now(timezone.utc)

    base_filter = [
        AletheiaToolInvocation.tenant_id == tid,
        AletheiaToolInvocation.timestamp >= since_dt,
        AletheiaToolInvocation.timestamp <= until_dt,
    ]
    if agent_id:
        base_filter.append(AletheiaToolInvocation.agent_id == agent_id)
    if command:
        base_filter.append(AletheiaToolInvocation.command.startswith(command))

    # Bucket via epoch arithmetic (Postgres)
    epoch_expr = func.extract("epoch", AletheiaToolInvocation.timestamp)
    bucket_epoch = (func.floor(epoch_expr / bucket_secs) * bucket_secs)
    bucket_ts = func.to_timestamp(bucket_epoch).label("bucket_ts")

    q = (
        select(
            bucket_ts,
            func.count().label("count"),
            func.sum(
                case((AletheiaToolInvocation.exit_code > 0, 1), else_=0)
            ).label("errors"),
            func.sum(
                case((AletheiaToolInvocation.policy_verdict == "deny", 1), else_=0)
            ).label("denied"),
        )
        .where(*base_filter)
        .group_by(bucket_ts)
        .order_by(bucket_ts)
    )

    rows = (await db.execute(q)).fetchall()

    buckets = []
    for row in rows:
        ts = row.bucket_ts
        if hasattr(ts, "isoformat"):
            ts_str = ts.isoformat()
        else:
            ts_str = datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
        buckets.append({
            "timestamp": ts_str,
            "count": row.count,
            "errors": row.errors or 0,
            "denied": row.denied or 0,
        })

    return {
        "buckets": buckets,
        "bucket_size": bucket,
    }
