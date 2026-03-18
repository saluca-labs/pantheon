"""
FastAPI endpoints for analytics and anomaly detection.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.analytics.detector import AnomalyType
from src.auth.rbac import require_permission

router = APIRouter(prefix="/v1/analytics", tags=["Analytics"])


def _get_baseline_engine():
    """Retrieve the global baseline engine instance."""
    from src.analytics._state import get_baseline_engine
    return get_baseline_engine()


def _get_detector():
    """Retrieve the global anomaly detector instance."""
    from src.analytics._state import get_detector
    return get_detector()


@router.get("/anomalies", summary="List detected anomalies", dependencies=[Depends(require_permission("analytics:read"))])
async def list_anomalies(
    type: Optional[str] = Query(None, description="Filter by anomaly type: rate_spike, unusual_resource, off_hours, new_scope, geo_anomaly"),
    severity: Optional[str] = Query(None, description="Filter by severity: low, medium, high, critical"),
    soulkey_id: Optional[str] = Query(None, description="Filter by soulkey UUID"),
    limit: int = Query(50, ge=1, le=500, description="Max anomalies to return"),
):
    """List recently detected behavioral anomalies with optional type, severity, and agent filters. Requires Pro tier or above."""
    detector = _get_detector()
    if detector is None:
        raise HTTPException(status_code=503, detail="Anomaly detector not initialized")

    anomaly_type = None
    if type:
        try:
            anomaly_type = AnomalyType(type)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid anomaly type: {type}")

    sk_id = None
    if soulkey_id:
        try:
            sk_id = uuid.UUID(soulkey_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid soulkey_id format")

    anomalies = await detector.get_recent_anomalies(
        limit=limit,
        anomaly_type=anomaly_type,
        severity=severity,
        soulkey_id=sk_id,
    )

    return {
        "anomalies": [a.to_dict() for a in anomalies],
        "count": len(anomalies),
    }


@router.get("/baseline/{soulkey_id}", summary="Get agent behavioral baseline", dependencies=[Depends(require_permission("analytics:read"))])
async def get_baseline(soulkey_id: str):
    """View an agent's behavioral baseline profile, including typical request patterns, resource access distribution, and timing characteristics."""
    engine = _get_baseline_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Baseline engine not initialized")

    try:
        sk_id = uuid.UUID(soulkey_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid soulkey_id format")

    baseline = await engine.get_baseline(sk_id)
    if not baseline:
        raise HTTPException(status_code=404, detail="No baseline found for this agent")

    return {"baseline": baseline.to_dict()}


@router.get("/dashboard", summary="Analytics dashboard summary", dependencies=[Depends(require_permission("analytics:read"))])
async def dashboard(hours: int = Query(24, ge=1, le=168, description="Lookback window in hours (1-168)")):
    """Summary dashboard with anomalies grouped by type and severity, top anomalous agents, and trend data over the specified time window."""
    detector = _get_detector()
    if detector is None:
        raise HTTPException(status_code=503, detail="Anomaly detector not initialized")

    stats = detector.get_dashboard_stats(hours=hours)
    return stats


@router.post("/baseline/rebuild", summary="Rebuild all agent baselines", dependencies=[Depends(require_permission("analytics:write"))])
async def rebuild_baselines(db: AsyncSession = Depends(get_db)):
    """Trigger a full baseline rebuild for all tracked agents. This recomputes behavioral profiles from recent audit data. May take several seconds for large deployments."""
    engine = _get_baseline_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Baseline engine not initialized")

    count = await engine.rebuild_all(db)
    return {"message": f"Rebuilt baselines for {count} agents", "count": count}
