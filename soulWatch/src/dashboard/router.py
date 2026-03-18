"""
Dashboard API for SoulWatch - real-time stats, timeline, agent risk scores.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.database.connection import get_db
from soulWatch.src.database.models import (
    SoulWatchAnomaly,
    SoulWatchDetection,
    SoulWatchQuarantine,
    SoulWatchBaseline,
)
from soulWatch.src.analytics.risk import compute_all_agent_risks

router = APIRouter(prefix="/watch/v1/dashboard", tags=["dashboard"])


@router.get("")
async def dashboard(
    db: AsyncSession = Depends(get_db),
):
    """Real-time dashboard stats: open anomalies, active quarantines, rules firing, risk distribution."""
    now = datetime.now(timezone.utc)
    last_24h = now - timedelta(hours=24)

    # Open anomalies
    open_result = await db.execute(
        select(func.count()).select_from(SoulWatchAnomaly)
        .where(SoulWatchAnomaly.status == "open")
    )
    open_anomalies = open_result.scalar() or 0

    # Anomalies in last 24h
    recent_result = await db.execute(
        select(func.count()).select_from(SoulWatchAnomaly)
        .where(SoulWatchAnomaly.created_at >= last_24h)
    )
    anomalies_24h = recent_result.scalar() or 0

    # Active quarantines
    q_result = await db.execute(
        select(func.count()).select_from(SoulWatchQuarantine)
        .where(SoulWatchQuarantine.status == "active")
    )
    active_quarantines = q_result.scalar() or 0

    # Detections in last 24h
    det_result = await db.execute(
        select(func.count()).select_from(SoulWatchDetection)
        .where(SoulWatchDetection.created_at >= last_24h)
    )
    detections_24h = det_result.scalar() or 0

    # Severity distribution (last 24h)
    sev_result = await db.execute(
        select(SoulWatchAnomaly.severity, func.count())
        .where(SoulWatchAnomaly.created_at >= last_24h)
        .group_by(SoulWatchAnomaly.severity)
    )
    severity_distribution = {row[0]: row[1] for row in sev_result.fetchall()}

    # Tracked baselines
    baseline_result = await db.execute(
        select(func.count()).select_from(SoulWatchBaseline)
    )
    tracked_baselines = baseline_result.scalar() or 0

    return {
        "open_anomalies": open_anomalies,
        "anomalies_24h": anomalies_24h,
        "active_quarantines": active_quarantines,
        "detections_24h": detections_24h,
        "severity_distribution": severity_distribution,
        "tracked_baselines": tracked_baselines,
        "timestamp": now.isoformat(),
    }


@router.get("/timeline")
async def anomaly_timeline(
    period: str = Query("24h", description="Time period: 24h, 7d, or 30d"),
    db: AsyncSession = Depends(get_db),
):
    """Anomaly timeline for charts - bucketed by hour or day."""
    now = datetime.now(timezone.utc)

    if period == "7d":
        cutoff = now - timedelta(days=7)
        bucket_sql = "date_trunc('day', created_at)"
        bucket_format = "day"
    elif period == "30d":
        cutoff = now - timedelta(days=30)
        bucket_sql = "date_trunc('day', created_at)"
        bucket_format = "day"
    else:
        cutoff = now - timedelta(hours=24)
        bucket_sql = "date_trunc('hour', created_at)"
        bucket_format = "hour"

    result = await db.execute(
        text(
            f"SELECT {bucket_sql} as bucket, severity, COUNT(*) as cnt "
            f"FROM _soulwatch_anomalies "
            f"WHERE created_at >= :cutoff "
            f"GROUP BY bucket, severity "
            f"ORDER BY bucket ASC"
        ),
        {"cutoff": cutoff},
    )
    rows = result.fetchall()

    timeline = {}
    for bucket_ts, severity, count in rows:
        bucket_key = bucket_ts.isoformat() if bucket_ts else "unknown"
        if bucket_key not in timeline:
            timeline[bucket_key] = {"timestamp": bucket_key, "total": 0}
        timeline[bucket_key][severity] = count
        timeline[bucket_key]["total"] += count

    return {
        "period": period,
        "bucket_format": bucket_format,
        "data": list(timeline.values()),
    }


@router.get("/agents")
async def agent_risk_scores(
    lookback_days: int = Query(30, ge=1, le=90),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Agent risk scores, sorted by risk level descending."""
    scores = await compute_all_agent_risks(db, lookback_days=lookback_days, limit=limit)

    return {
        "agents": [s.to_dict() for s in scores],
        "count": len(scores),
        "lookback_days": lookback_days,
    }
