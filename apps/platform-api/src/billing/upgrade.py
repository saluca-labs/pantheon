"""
Self-service tier upgrade via Stripe subscription update — BILL-02.

Requires env var: STRIPE_SECRET_KEY
Updates Stripe subscription price and updates tenant tier in DB.
"""
from __future__ import annotations
import os
import uuid
import structlog
from typing import Optional

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulTenant

logger = structlog.get_logger(__name__)

STRIPE_API_BASE = "https://api.stripe.com/v1"

from src.tier import VALID_TIERS as ALL_TIERS, tier_meets
# Owner tier is not available for self-service upgrade — it is assigned manually.
UPGRADE_TIERS = ALL_TIERS - {"community", "owner"}


def _stripe_key() -> str:
    key = os.getenv("STRIPE_SECRET_KEY", "")
    if not key:
        raise RuntimeError("STRIPE_SECRET_KEY env var not set")
    return key


async def upgrade_tenant_tier(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    new_tier: str,
    stripe_price_id: Optional[str] = None,
) -> dict:
    """
    Upgrade tenant subscription tier.
    1. Updates Stripe subscription (if stripe_subscription_id exists in metadata)
    2. Updates tenant.tier in DB
    Returns dict with old_tier, new_tier, stripe_subscription_id.
    """
    if new_tier not in UPGRADE_TIERS:
        raise ValueError(f"Invalid tier: {new_tier}. Must be one of {UPGRADE_TIERS}")

    result = await db.execute(select(SoulTenant).where(SoulTenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise ValueError(f"Tenant {tenant_id} not found")

    # Block partner sub-tenants from upgrading to mssp tier or higher
    if tenant.parent_tenant_id and tier_meets(new_tier, "mssp"):
        raise ValueError(
            f"Partner sub-tenants cannot be upgraded to '{new_tier}'. "
            f"Only top-level tenants may hold mssp/saas tier."
        )

    old_tier = tenant.tier
    meta = tenant.metadata_ or {}
    stripe_subscription_id = meta.get("stripe_subscription_id")

    # Update Stripe if subscription exists
    if stripe_subscription_id:
        try:
            await _update_stripe_subscription(stripe_subscription_id, new_tier, stripe_price_id)
        except Exception as exc:
            logger.warning("stripe_upgrade_failed", tenant_id=str(tenant_id), error=str(exc))
            # Continue — update tier in DB regardless (admin can reconcile Stripe manually)

    # Update DB tier
    await db.execute(
        update(SoulTenant)
        .where(SoulTenant.id == tenant_id)
        .values(tier=new_tier)
    )
    await db.commit()

    logger.info("tenant_tier_upgraded", tenant_id=str(tenant_id), old_tier=old_tier, new_tier=new_tier)
    return {
        "tenant_id": str(tenant_id),
        "old_tier": old_tier,
        "new_tier": new_tier,
        "stripe_subscription_id": stripe_subscription_id,
        "status": "upgraded",
    }


async def _update_stripe_subscription(
    subscription_id: str, new_tier: str, price_id: Optional[str]
) -> None:
    """Update Stripe subscription to new price. Uses metadata.tiresias_tier if no price_id."""
    # Fetch current subscription to get item ID
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{STRIPE_API_BASE}/subscriptions/{subscription_id}",
            auth=(_stripe_key(), ""),
            timeout=10.0,
        )
        resp.raise_for_status()
        sub = resp.json()

        items = sub.get("items", {}).get("data", [])
        if not items:
            return

        item_id = items[0]["id"]

        # Build update payload
        payload: dict = {"metadata[tiresias_tier]": new_tier}
        if price_id:
            payload["items[0][id]"] = item_id
            payload["items[0][price]"] = price_id

        update_resp = await client.post(
            f"{STRIPE_API_BASE}/subscriptions/{subscription_id}",
            auth=(_stripe_key(), ""),
            data=payload,
            timeout=10.0,
        )
        update_resp.raise_for_status()
