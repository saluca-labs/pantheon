"""
FastAPI endpoints for SoulWatch analytics and anomaly detection.
All endpoints under /watch/v1/.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.database.connection import get_db
from soulWatch.src.database.models import SoulWatchAnomaly, SoulWatchBaseline

router = APIRouter(prefix="/watch/v1", tags=["analytics"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class AnomalyResponse(BaseModel):
    id: str
    soulkey_id: str
    tenant_id: Optional[str] = None
    anomaly_type: str
    severity: str
    description: str
    evidence: Optional[dict] = None
    baseline_value: Optional[str] = None
    observed_value: Optional[str] = None
    status: str
    acknowledged_by: Optional[str] = None
    resolved_at: Optional[str] = None
    source_event_id: Optional[str] = None
    created_at: Optional[str] = None


class AnomalyUpdateRequest(BaseModel):
    status: str  # open, acknowledged, resolved, false_positive
    acknowledged_by: Optional[str] = None


class AnomalyStatsResponse(BaseModel):
    total: int
    by_type: dict
    by_severity: dict
    by_status: dict
    open_count: int


class BaselineResponse(BaseModel):
    id: str
    soulkey_id: str
    typical_request_rate: float
    typical_resources: list
    typical_actions: list
    typical_scopes: list
    typical_hours: list
    typical_denial_rate: float
    typical_burst_size: int
    events_analyzed: int
    updated_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Anomaly endpoints
# ---------------------------------------------------------------------------


@router.get("/anomalies", response_model=dict)
async def list_anomalies(
    tenant_id: Optional[str] = Query(None),
    soulkey_id: Optional[str] = Query(None),
    anomaly_type: Optional[str] = Query(None, alias="type"),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    since: Optional[str] = Query(None, description="ISO datetime for time range start"),
    until: Optional[str] = Query(None, description="ISO datetime for time range end"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """List detected anomalies with pagination and filters.

    tenant_id is required. When SOULWATCH_TENANT_HIERARCHY_MODE=true the
    query includes rows from descendant tenants.
    """
    from soulWatch.src.database.tenants import get_descendant_tenant_ids
    from soulWatch.config.settings import get_settings

    # Tenant isolation — require explicit tenant_id.
    if not tenant_id:
        raise HTTPException(status_code=401, detail="tenant_id is required")

    try:
        uuid.UUID(tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant_id")

    settings = get_settings()
    if settings.tenant_hierarchy_mode:
        tenant_ids = await get_descendant_tenant_ids(db, tenant_id)
        tenant_uuids = [uuid.UUID(t) for t in tenant_ids]
        tenant_filter = SoulWatchAnomaly.tenant_id.in_(tenant_uuids)
    else:
        tid = uuid.UUID(tenant_id)
        tenant_filter = SoulWatchAnomaly.tenant_id == tid

    query = select(SoulWatchAnomaly).where(tenant_filter).order_by(SoulWatchAnomaly.created_at.desc())

    if soulkey_id:
        try:
            sk_id = uuid.UUID(soulkey_id)
            query = query.where(SoulWatchAnomaly.soulkey_id == sk_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid soulkey_id format")

    if anomaly_type:
        query = query.where(SoulWatchAnomaly.anomaly_type == anomaly_type)
    if severity:
        query = query.where(SoulWatchAnomaly.severity == severity)
    if status:
        query = query.where(SoulWatchAnomaly.status == status)

    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            query = query.where(SoulWatchAnomaly.created_at >= since_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid 'since' datetime format")

    if until:
        try:
            until_dt = datetime.fromisoformat(until)
            query = query.where(SoulWatchAnomaly.created_at <= until_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid 'until' datetime format")

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    anomalies = result.scalars().all()

    return {
        "anomalies": [
            {
                "id": str(a.id),
                "soulkey_id": str(a.soulkey_id),
                "tenant_id": str(a.tenant_id) if a.tenant_id else None,
                "anomaly_type": a.anomaly_type,
                "severity": a.severity,
                "description": a.description,
                "evidence": a.evidence,
                "baseline_value": a.baseline_value,
                "observed_value": a.observed_value,
                "status": a.status,
                "acknowledged_by": a.acknowledged_by,
                "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
                "source_event_id": str(a.source_event_id) if a.source_event_id else None,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in anomalies
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/anomalies/stats", response_model=AnomalyStatsResponse)
async def anomaly_stats(
    since_hours: int = Query(24, ge=1, le=720),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated anomaly statistics."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=since_hours)

    # By type
    type_result = await db.execute(
        select(SoulWatchAnomaly.anomaly_type, func.count())
        .where(SoulWatchAnomaly.created_at >= cutoff)
        .group_by(SoulWatchAnomaly.anomaly_type)
    )
    by_type = {row[0]: row[1] for row in type_result.fetchall()}

    # By severity
    sev_result = await db.execute(
        select(SoulWatchAnomaly.severity, func.count())
        .where(SoulWatchAnomaly.created_at >= cutoff)
        .group_by(SoulWatchAnomaly.severity)
    )
    by_severity = {row[0]: row[1] for row in sev_result.fetchall()}

    # By status
    status_result = await db.execute(
        select(SoulWatchAnomaly.status, func.count())
        .where(SoulWatchAnomaly.created_at >= cutoff)
        .group_by(SoulWatchAnomaly.status)
    )
    by_status = {row[0]: row[1] for row in status_result.fetchall()}

    total = sum(by_type.values())
    open_count = by_status.get("open", 0)

    return AnomalyStatsResponse(
        total=total,
        by_type=by_type,
        by_severity=by_severity,
        by_status=by_status,
        open_count=open_count,
    )


@router.get("/anomalies/{anomaly_id}")
async def get_anomaly(
    anomaly_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single anomaly by ID."""
    try:
        aid = uuid.UUID(anomaly_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid anomaly ID format")

    result = await db.execute(
        select(SoulWatchAnomaly).where(SoulWatchAnomaly.id == aid)
    )
    anomaly = result.scalar_one_or_none()
    if not anomaly:
        raise HTTPException(status_code=404, detail="Anomaly not found")

    return {
        "id": str(anomaly.id),
        "soulkey_id": str(anomaly.soulkey_id),
        "tenant_id": str(anomaly.tenant_id) if anomaly.tenant_id else None,
        "anomaly_type": anomaly.anomaly_type,
        "severity": anomaly.severity,
        "description": anomaly.description,
        "evidence": anomaly.evidence,
        "baseline_value": anomaly.baseline_value,
        "observed_value": anomaly.observed_value,
        "status": anomaly.status,
        "acknowledged_by": anomaly.acknowledged_by,
        "resolved_at": anomaly.resolved_at.isoformat() if anomaly.resolved_at else None,
        "source_event_id": str(anomaly.source_event_id) if anomaly.source_event_id else None,
        "created_at": anomaly.created_at.isoformat() if anomaly.created_at else None,
    }


@router.patch("/anomalies/{anomaly_id}")
async def update_anomaly(
    anomaly_id: str,
    body: AnomalyUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update an anomaly's status (open/acknowledged/resolved/false_positive)."""
    valid_statuses = {"open", "acknowledged", "resolved", "false_positive"}
    if body.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {valid_statuses}",
        )

    try:
        aid = uuid.UUID(anomaly_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid anomaly ID format")

    result = await db.execute(
        select(SoulWatchAnomaly).where(SoulWatchAnomaly.id == aid)
    )
    anomaly = result.scalar_one_or_none()
    if not anomaly:
        raise HTTPException(status_code=404, detail="Anomaly not found")

    anomaly.status = body.status
    if body.acknowledged_by:
        anomaly.acknowledged_by = body.acknowledged_by
    if body.status == "resolved":
        anomaly.resolved_at = datetime.now(timezone.utc)

    await db.flush()

    return {"id": str(anomaly.id), "status": anomaly.status, "message": "Updated"}


# ---------------------------------------------------------------------------
# Baseline endpoints
# ---------------------------------------------------------------------------


@router.get("/baselines")
async def list_baselines(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List all agent baselines."""
    offset = (page - 1) * page_size
    result = await db.execute(
        select(SoulWatchBaseline)
        .order_by(SoulWatchBaseline.updated_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    baselines = result.scalars().all()

    count_result = await db.execute(
        select(func.count()).select_from(SoulWatchBaseline)
    )
    total = count_result.scalar() or 0

    return {
        "baselines": [
            {
                "id": str(b.id),
                "soulkey_id": str(b.soulkey_id),
                "typical_request_rate": b.typical_request_rate,
                "typical_resources": b.typical_resources or [],
                "typical_actions": b.typical_actions or [],
                "typical_scopes": b.typical_scopes or [],
                "typical_hours": b.typical_hours or [],
                "typical_denial_rate": b.typical_denial_rate,
                "typical_burst_size": b.typical_burst_size,
                "events_analyzed": b.events_analyzed,
                "updated_at": b.updated_at.isoformat() if b.updated_at else None,
            }
            for b in baselines
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/baselines/{soulkey_id}")
async def get_baseline(
    soulkey_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific agent's baseline."""
    try:
        sk_id = uuid.UUID(soulkey_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid soulkey_id format")

    result = await db.execute(
        select(SoulWatchBaseline).where(SoulWatchBaseline.soulkey_id == sk_id)
    )
    baseline = result.scalar_one_or_none()
    if not baseline:
        raise HTTPException(status_code=404, detail="No baseline found for this agent")

    return {
        "id": str(baseline.id),
        "soulkey_id": str(baseline.soulkey_id),
        "typical_request_rate": baseline.typical_request_rate,
        "typical_resources": baseline.typical_resources or [],
        "typical_actions": baseline.typical_actions or [],
        "typical_scopes": baseline.typical_scopes or [],
        "typical_hours": baseline.typical_hours or [],
        "typical_denial_rate": baseline.typical_denial_rate,
        "typical_burst_size": baseline.typical_burst_size,
        "events_analyzed": baseline.events_analyzed,
        "updated_at": baseline.updated_at.isoformat() if baseline.updated_at else None,
    }


@router.post("/baselines/rebuild")
async def rebuild_all_baselines(
    db: AsyncSession = Depends(get_db),
):
    """Trigger a full baseline rebuild for all tracked agents."""
    from soulWatch.src.analytics._state import get_baseline_engine
    engine = get_baseline_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Baseline engine not initialized")

    count = await engine.rebuild_all(db)
    return {"message": f"Rebuilt baselines for {count} agents", "count": count}


@router.post("/baselines/{soulkey_id}/rebuild")
async def rebuild_agent_baseline(
    soulkey_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Rebuild baseline for a specific agent."""
    from soulWatch.src.analytics._state import get_baseline_engine
    engine = get_baseline_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Baseline engine not initialized")

    try:
        sk_id = uuid.UUID(soulkey_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid soulkey_id format")

    baseline = await engine.build_baseline(db, sk_id)
    return {"message": "Baseline rebuilt", "baseline": baseline.to_dict()}
