"""
Trial expiration job.
Implements TRIAL-05: 14-day trial expiry with auto-downgrade to Community.

Run via cron or APScheduler (every hour):
  python -m src.saas.trial_expiry

Or call expire_trials() directly from a scheduler.

Behavior:
  - Finds all tenants with metadata.trial_expires_at <= now() AND tier != community
  - Downgrades tier to community
  - Sets metadata.data_retention_until = now() + 30 days (data preserved per spec)
  - Logs each downgrade for audit trail
"""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db_session
from src.database.models import SoulTenant

logger = structlog.get_logger(__name__)

DATA_RETENTION_DAYS = 30
COMMUNITY_TIER = "community"


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    """Parse ISO 8601 string to timezone-aware datetime. Returns None on failure."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


async def expire_trials(db: AsyncSession) -> dict:
    """
    Check all tenants for expired trials and downgrade to Community.

    A tenant is trial-expired when:
      - metadata_.trial_expires_at is set AND <= now()
      - tier is not already 'community'

    Returns summary dict with counts.
    """
    now = datetime.now(timezone.utc)
    retention_until = now + timedelta(days=DATA_RETENTION_DAYS)

    # Load all non-community tenants (community never needs expiry check)
    result = await db.execute(
        select(SoulTenant).where(
            SoulTenant.tier != COMMUNITY_TIER,
            SoulTenant.status == "active",
        )
    )
    tenants = result.scalars().all()

    expired_count = 0
    checked_count = len(tenants)

    for tenant in tenants:
        meta = tenant.metadata_ or {}
        trial_expires_at = _parse_iso(meta.get("trial_expires_at"))

        if trial_expires_at is None:
            # No trial expiry set — skip (this tenant is on a paid subscription)
            continue

        if trial_expires_at > now:
            # Trial still active
            continue

        # Trial has expired — downgrade to community
        old_tier = tenant.tier
        meta["data_retention_until"] = retention_until.isoformat()
        meta["trial_expired_at"] = now.isoformat()
        meta["trial_downgraded_from"] = old_tier

        await db.execute(
            update(SoulTenant)
            .where(SoulTenant.id == tenant.id)
            .values(
                tier=COMMUNITY_TIER,
                metadata=meta,
                updated_at=now,
            )
        )

        expired_count += 1
        logger.info(
            "trial.expired.downgraded",
            tenant_id=str(tenant.id),
            old_tier=old_tier,
            new_tier=COMMUNITY_TIER,
            trial_expires_at=trial_expires_at.isoformat(),
            data_retention_until=retention_until.isoformat(),
        )

    logger.info(
        "trial.expiry_job.complete",
        checked=checked_count,
        expired=expired_count,
        run_at=now.isoformat(),
    )

    return {
        "checked": checked_count,
        "expired": expired_count,
        "run_at": now.isoformat(),
    }


async def _main():
    """Entry point for direct execution: python -m src.saas.trial_expiry"""
    async for db in get_db_session():
        result = await expire_trials(db)
        print(f"Trial expiry job complete: {result}")


if __name__ == "__main__":
    asyncio.run(_main())
