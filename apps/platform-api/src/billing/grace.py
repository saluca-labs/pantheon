"""
Payment failure grace period logic — BILL-04.

On invoice.payment_failed:
  - Set tenant status = "payment_failed", record payment_failed_at in metadata
  - Tenant can still access the product for 3 days
  - After 3 days: auto-downgrade to "community" tier, status -> "active"

Called from:
  1. /v1/saas/billing/webhook (existing Stripe webhook handler) for invoice.payment_failed
  2. A background task / cron (run_grace_period_check) that sweeps expired grace periods

Grace period state stored in SoulTenant.metadata_:
  metadata_.payment_failed_at: ISO datetime string
  metadata_.payment_failed_grace_days: int (default 3)
"""
from __future__ import annotations
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
import structlog

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulTenant

logger = structlog.get_logger(__name__)

GRACE_DAYS = 3
DOWNGRADE_TIER = "community"


async def handle_payment_failed(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """
    Called when Stripe fires invoice.payment_failed for a tenant.
    Sets payment_failed status + records failure timestamp in metadata.
    Returns dict with grace_deadline.
    """
    result = await db.execute(select(SoulTenant).where(SoulTenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        logger.warning("payment_failed_tenant_not_found", tenant_id=str(tenant_id))
        return {"error": "tenant not found"}

    now = datetime.now(timezone.utc)
    grace_deadline = now + timedelta(days=GRACE_DAYS)
    meta = dict(tenant.metadata_ or {})
    meta["payment_failed_at"] = now.isoformat()
    meta["grace_deadline"] = grace_deadline.isoformat()

    await db.execute(
        update(SoulTenant)
        .where(SoulTenant.id == tenant_id)
        .values(status="payment_failed", metadata_=meta)
    )
    await db.commit()

    logger.info(
        "payment_failed_grace_started",
        tenant_id=str(tenant_id),
        grace_deadline=grace_deadline.isoformat(),
    )
    return {
        "tenant_id": str(tenant_id),
        "payment_failed_at": now.isoformat(),
        "grace_deadline": grace_deadline.isoformat(),
        "days_remaining": GRACE_DAYS,
    }


async def resolve_payment(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """
    Called when invoice.paid fires after a failed payment.
    Clears payment_failed status — tenant returns to active.
    """
    result = await db.execute(select(SoulTenant).where(SoulTenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        return {"error": "tenant not found"}

    meta = dict(tenant.metadata_ or {})
    meta.pop("payment_failed_at", None)
    meta.pop("grace_deadline", None)

    await db.execute(
        update(SoulTenant)
        .where(SoulTenant.id == tenant_id)
        .values(status="active", metadata_=meta)
    )
    await db.commit()

    logger.info("payment_resolved", tenant_id=str(tenant_id))
    return {"tenant_id": str(tenant_id), "status": "active"}


async def run_grace_period_check(db: AsyncSession) -> list[str]:
    """
    Sweep all payment_failed tenants. Downgrade any whose grace_deadline has passed.
    Returns list of downgraded tenant IDs. Call from a cron or startup lifespan.
    """
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(SoulTenant).where(SoulTenant.status == "payment_failed")
    )
    tenants = result.scalars().all()
    downgraded: list[str] = []

    for tenant in tenants:
        meta = tenant.metadata_ or {}
        grace_deadline_str = meta.get("grace_deadline")
        if not grace_deadline_str:
            continue

        deadline = datetime.fromisoformat(grace_deadline_str)
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)

        if now > deadline:
            clean_meta = dict(meta)
            clean_meta.pop("payment_failed_at", None)
            clean_meta.pop("grace_deadline", None)

            await db.execute(
                update(SoulTenant)
                .where(SoulTenant.id == tenant.id)
                .values(tier=DOWNGRADE_TIER, status="active", metadata_=clean_meta)
            )
            downgraded.append(str(tenant.id))
            logger.warning(
                "payment_grace_expired_downgraded",
                tenant_id=str(tenant.id),
                downgraded_to=DOWNGRADE_TIER,
            )

    if downgraded:
        await db.commit()

    return downgraded


async def get_grace_status(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """Return grace period status for a tenant. Used by dashboard banner (BILL-04)."""
    result = await db.execute(select(SoulTenant).where(SoulTenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        return {"error": "not found"}

    meta = tenant.metadata_ or {}
    failed_at = meta.get("payment_failed_at")
    deadline_str = meta.get("grace_deadline")

    if tenant.status != "payment_failed" or not deadline_str:
        return {
            "tenant_id": str(tenant_id),
            "status": tenant.status,
            "payment_failed_at": None,
            "grace_deadline": None,
            "days_remaining": None,
        }

    deadline = datetime.fromisoformat(deadline_str)
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    days_remaining = max(0, (deadline - now).days)

    return {
        "tenant_id": str(tenant_id),
        "status": tenant.status,
        "payment_failed_at": failed_at,
        "grace_deadline": deadline_str,
        "days_remaining": days_remaining,
    }
