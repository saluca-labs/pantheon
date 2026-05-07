"""
Agent risk scoring engine for SoulWatch.
Computes a composite risk score (0-100) per agent based on anomaly frequency,
severity distribution, baseline drift, and quarantine history.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.database.models import SoulWatchAnomaly, SoulWatchQuarantine

logger = structlog.get_logger(__name__)


# Severity weights for risk calculation
SEVERITY_WEIGHTS = {
    "low": 1,
    "medium": 3,
    "high": 7,
    "critical": 15,
}

RISK_LEVELS = {
    (0, 25): "low",
    (25, 50): "medium",
    (50, 75): "high",
    (75, 101): "critical",
}


@dataclass
class AgentRiskScore:
    """Risk assessment for a single agent."""

    soulkey_id: uuid.UUID
    score: float  # 0-100
    risk_level: str  # low, medium, high, critical
    anomaly_count: int
    severity_distribution: dict[str, int]
    quarantine_count: int
    active_quarantines: int
    last_anomaly_at: Optional[datetime]

    def to_dict(self) -> dict:
        return {
            "soulkey_id": str(self.soulkey_id),
            "score": round(self.score, 1),
            "risk_level": self.risk_level,
            "anomaly_count": self.anomaly_count,
            "severity_distribution": self.severity_distribution,
            "quarantine_count": self.quarantine_count,
            "active_quarantines": self.active_quarantines,
            "last_anomaly_at": self.last_anomaly_at.isoformat() if self.last_anomaly_at else None,
        }


def _compute_risk_level(score: float) -> str:
    """Map numeric score to risk level string."""
    for (low, high), level in RISK_LEVELS.items():
        if low <= score < high:
            return level
    return "critical"


async def compute_agent_risk(
    db: AsyncSession,
    soulkey_id: uuid.UUID,
    lookback_days: int = 30,
) -> AgentRiskScore:
    """
    Compute the composite risk score for a single agent.

    Factors:
    1. Anomaly frequency (normalized to 30-day window)
    2. Severity distribution (weighted)
    3. Quarantine history
    4. Recency of anomalies
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    # Anomaly stats
    anomaly_result = await db.execute(
        select(
            SoulWatchAnomaly.severity,
            func.count().label("cnt"),
        )
        .where(
            SoulWatchAnomaly.soulkey_id == soulkey_id,
            SoulWatchAnomaly.created_at >= cutoff,
        )
        .group_by(SoulWatchAnomaly.severity)
    )
    severity_rows = anomaly_result.fetchall()

    severity_dist = {}
    total_anomalies = 0
    weighted_severity = 0
    for sev, cnt in severity_rows:
        severity_dist[sev] = cnt
        total_anomalies += cnt
        weighted_severity += cnt * SEVERITY_WEIGHTS.get(sev, 1)

    # Last anomaly timestamp
    last_anomaly_result = await db.execute(
        select(func.max(SoulWatchAnomaly.created_at))
        .where(SoulWatchAnomaly.soulkey_id == soulkey_id)
    )
    last_anomaly_at = last_anomaly_result.scalar()

    # Quarantine history
    quarantine_result = await db.execute(
        select(func.count()).select_from(SoulWatchQuarantine)
        .where(SoulWatchQuarantine.soulkey_id == soulkey_id)
    )
    quarantine_count = quarantine_result.scalar() or 0

    active_quarantine_result = await db.execute(
        select(func.count()).select_from(SoulWatchQuarantine)
        .where(
            SoulWatchQuarantine.soulkey_id == soulkey_id,
            SoulWatchQuarantine.status == "active",
        )
    )
    active_quarantines = active_quarantine_result.scalar() or 0

    # Compute composite score (0-100)
    # Component 1: Severity-weighted anomaly count (max 40 points)
    severity_score = min(weighted_severity * 2, 40)

    # Component 2: Anomaly frequency (max 25 points)
    frequency_score = min(total_anomalies * 1.5, 25)

    # Component 3: Quarantine history (max 20 points)
    quarantine_score = min(quarantine_count * 5, 15) + (active_quarantines * 5)
    quarantine_score = min(quarantine_score, 20)

    # Component 4: Recency bonus (max 15 points)
    recency_score = 0.0
    if last_anomaly_at:
        hours_since = (datetime.now(timezone.utc) - last_anomaly_at).total_seconds() / 3600
        if hours_since < 1:
            recency_score = 15
        elif hours_since < 24:
            recency_score = 10
        elif hours_since < 168:  # 7 days
            recency_score = 5

    total_score = min(severity_score + frequency_score + quarantine_score + recency_score, 100)

    return AgentRiskScore(
        soulkey_id=soulkey_id,
        score=total_score,
        risk_level=_compute_risk_level(total_score),
        anomaly_count=total_anomalies,
        severity_distribution=severity_dist,
        quarantine_count=quarantine_count,
        active_quarantines=active_quarantines,
        last_anomaly_at=last_anomaly_at,
    )


async def compute_all_agent_risks(
    db: AsyncSession,
    lookback_days: int = 30,
    limit: int = 100,
) -> list[AgentRiskScore]:
    """
    Compute risk scores for all agents with recent anomalies.
    Returns sorted by score descending.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    # Find all agents with anomalies in the lookback window
    result = await db.execute(
        select(SoulWatchAnomaly.soulkey_id)
        .where(SoulWatchAnomaly.created_at >= cutoff)
        .distinct()
    )
    soulkey_ids = [row[0] for row in result.fetchall()]

    scores = []
    for sk_id in soulkey_ids:
        try:
            score = await compute_agent_risk(db, sk_id, lookback_days)
            scores.append(score)
        except Exception as e:
            logger.warning("risk.compute_failed", soulkey_id=str(sk_id), error=str(e))

    # Sort by score descending
    scores.sort(key=lambda s: s.score, reverse=True)
    return scores[:limit]
