"""
Usage limits and current-period aggregation.
Implements USAGE-01, USAGE-02, USAGE-03.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import AuditLog, Soulkey, SoulTenant
from src.saas.metering import get_tenant_usage
from src.tier import Tier, VALID_TIERS as _VALID_TIERS, DEFAULT_TIER

logger = structlog.get_logger(__name__)

# -1 = unlimited
TIER_LIMITS: dict[str, dict[str, int]] = {
    "community":  {"agents": 25,          "requests": 10_000,      "storage_bytes": 1_073_741_824},
    "starter":    {"agents": 50,          "requests": 100_000,     "storage_bytes": 10_737_418_240},
    "pro":        {"agents": 250,         "requests": 1_000_000,   "storage_bytes": 107_374_182_400},
    "enterprise": {"agents": -1,          "requests": -1,          "storage_bytes": -1},
    "mssp":       {"agents": -1,          "requests": -1,          "storage_bytes": -1},
    "saas":       {"agents": -1,          "requests": -1,          "storage_bytes": -1},
}

# Thresholds
WARN_PCT  = 80   # yellow banner + email
BLOCK_PCT = 100  # X-Usage-Warning header (soft block, still 200)
HARD_PCT  = 110  # 429 response


def pct_used(current: int, limit: int) -> float:
    """Return percentage used. Returns 0.0 if limit is -1 (unlimited)."""
    if limit == -1 or limit == 0:
        return 0.0
    return round((current / limit) * 100, 2)


def _month_start() -> datetime:
    """Return UTC start of current calendar month."""
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def get_active_agent_count(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    """Count active soulkeys (agents) for a tenant."""
    result = await db.execute(
        select(func.count(Soulkey.id)).where(
            Soulkey.tenant_id == tenant_id,
            Soulkey.status == "active",
        )
    )
    return result.scalar() or 0


async def get_usage_current(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    tier: str,
) -> dict:
    """
    Return current-period usage vs tier limits.
    Period = current calendar month (UTC).
    """
    limits = TIER_LIMITS.get(tier, TIER_LIMITS["community"])
    period_start = _month_start()
    now = datetime.now(timezone.utc)

    # Agent count is instantaneous (not period-scoped)
    agent_count = await get_active_agent_count(db, tenant_id)

    # Request + storage from metering
    try:
        raw = await get_tenant_usage(db, tenant_id, start=period_start, end=now)
    except ValueError:
        raw = {"requests": 0, "storage_bytes": 0, "total_events": 0}

    requests     = raw.get("requests", 0)
    storage_bytes = raw.get("storage_bytes", 0)

    return {
        "tenant_id": str(tenant_id),
        "tier": tier,
        "period": {
            "start": period_start.isoformat(),
            "end": now.isoformat(),
        },
        "usage": {
            "agents":        agent_count,
            "requests":      requests,
            "storage_bytes": storage_bytes,
        },
        "limits": {
            "agents":        limits["agents"],
            "requests":      limits["requests"],
            "storage_bytes": limits["storage_bytes"],
        },
        "pct": {
            "agents":        pct_used(agent_count,   limits["agents"]),
            "requests":      pct_used(requests,      limits["requests"]),
            "storage_bytes": pct_used(storage_bytes, limits["storage_bytes"]),
        },
    }


async def check_alerts(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    tier: str,
) -> dict:
    """
    Return alert level based on highest dimension usage percentage.
    alert_level: "none" | "warning" | "critical"
    critical = any dimension >= 100%, warning = any dimension >= 80%.
    """
    data = await get_usage_current(db, tenant_id, tier)
    pcts = data["pct"]
    max_pct = max(pcts.values()) if pcts else 0.0

    if max_pct >= BLOCK_PCT:
        level = "critical"
    elif max_pct >= WARN_PCT:
        level = "warning"
    else:
        level = "none"

    return {
        "tenant_id": str(tenant_id),
        "tier": tier,
        "alert_level": level,
        "max_pct_used": max_pct,
        "dimensions": pcts,
        "thresholds": {
            "warn_pct":  WARN_PCT,
            "block_pct": BLOCK_PCT,
            "hard_pct":  HARD_PCT,
        },
    }
