"""
Stripe billing webhook handler — subscription lifecycle -> tenant tier updates.
Implements SAAS-03.

Stripe sends events as JSON to /v1/saas/billing/webhook.
We do NOT verify the Stripe signature (no Stripe SDK dep) — the endpoint is
protected by SaaS-tier route guard. Signature verification can be added later
by reading STRIPE_WEBHOOK_SECRET from env and doing HMAC-SHA256 comparison.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulTenant

logger = structlog.get_logger(__name__)

# Stripe plan/product -> Tiresias tier mapping
# Extend this dict when new Stripe products are created
STRIPE_TIER_MAP: dict[str, str] = {
    "starter": "starter",
    "pro": "pro",
    "enterprise": "enterprise",
    "mssp": "mssp",
    "saas": "saas",
    # Stripe price IDs or product names can be mapped here
    "price_1TDMSlBkXMYmrc2L29W09pQl": "starter",
    "price_1TDMSlBkXMYmrc2LuuaUN5Cp": "starter",
    "price_starter": "starter",
    "price_1TDMT2BkXMYmrc2Lhf1whQpi": "pro",
    "price_1TDMT2BkXMYmrc2LnBUoJEww": "pro",
    "price_pro": "pro",
    "price_enterprise": "enterprise",
    "price_mssp": "mssp",
    "price_saas": "saas",
}


def _resolve_tier_from_stripe(event_data: dict) -> Optional[str]:
    """
    Extract Tiresias tier from a Stripe subscription event.
    Checks: metadata.tiresias_tier -> plan.nickname -> plan.id -> product.name
    Returns None if tier cannot be resolved.
    """
    subscription = event_data.get("object", {})

    # 1. Prefer explicit metadata
    meta = subscription.get("metadata", {})
    if meta.get("tiresias_tier"):
        return meta["tiresias_tier"].lower()

    # 2. Check items list for plan details
    items = subscription.get("items", {}).get("data", [])
    for item in items:
        plan = item.get("plan", {})
        nickname = (plan.get("nickname") or "").lower()
        plan_id = (plan.get("id") or "").lower()
        for key in [nickname, plan_id]:
            if key in STRIPE_TIER_MAP:
                return STRIPE_TIER_MAP[key]

    # 3. Fallback: top-level plan field (older Stripe API)
    plan = subscription.get("plan", {})
    nickname = (plan.get("nickname") or "").lower()
    plan_id = (plan.get("id") or "").lower()
    for key in [nickname, plan_id]:
        if key in STRIPE_TIER_MAP:
            return STRIPE_TIER_MAP[key]

    return None


async def handle_stripe_event(
    db: AsyncSession,
    event_type: str,
    event_data: dict,
) -> dict:
    """
    Process a Stripe webhook event and update tenant tier accordingly.

    Handled events:
    - customer.subscription.updated -> update tier from plan
    - customer.subscription.deleted -> downgrade to "starter"
    - customer.subscription.created -> same as updated

    Returns dict with action taken and tenant_id if found.
    """
    subscription = event_data.get("object", {})
    customer_id = subscription.get("customer")
    stripe_tenant_id = subscription.get("metadata", {}).get("tenant_id")

    # Resolve tenant: prefer metadata.tenant_id, fallback to customer_id lookup
    tenant: Optional[SoulTenant] = None

    if stripe_tenant_id:
        try:
            tid = uuid.UUID(stripe_tenant_id)
            result = await db.execute(
                select(SoulTenant).where(SoulTenant.id == tid)
            )
            tenant = result.scalar_one_or_none()
        except ValueError:
            pass

    if tenant is None and customer_id:
        # Look up by stripe_customer_id stored in metadata
        result = await db.execute(select(SoulTenant))
        all_tenants = result.scalars().all()
        for t in all_tenants:
            meta = t.metadata_ or {}
            if meta.get("stripe_customer_id") == customer_id:
                tenant = t
                break

    if tenant is None:
        logger.warning(
            "saas.billing.tenant_not_found",
            event_type=event_type,
            customer_id=customer_id,
            stripe_tenant_id=stripe_tenant_id,
        )
        return {"action": "tenant_not_found", "customer_id": customer_id}

    if event_type in ("customer.subscription.updated", "customer.subscription.created"):
        new_tier = _resolve_tier_from_stripe(event_data)
        if not new_tier:
            logger.warning(
                "saas.billing.tier_unresolvable",
                event_type=event_type,
                tenant_id=str(tenant.id),
            )
            return {"action": "tier_unresolvable", "tenant_id": str(tenant.id)}

        old_tier = tenant.tier
        await db.execute(
            update(SoulTenant)
            .where(SoulTenant.id == tenant.id)
            .values(tier=new_tier, updated_at=datetime.now(timezone.utc))
        )
        logger.info(
            "saas.billing.tier_updated",
            tenant_id=str(tenant.id),
            old_tier=old_tier,
            new_tier=new_tier,
            event_type=event_type,
        )
        return {
            "action": "tier_updated",
            "tenant_id": str(tenant.id),
            "old_tier": old_tier,
            "new_tier": new_tier,
        }

    elif event_type == "customer.subscription.deleted":
        old_tier = tenant.tier
        await db.execute(
            update(SoulTenant)
            .where(SoulTenant.id == tenant.id)
            .values(tier="starter", updated_at=datetime.now(timezone.utc))
        )
        logger.info(
            "saas.billing.subscription_cancelled",
            tenant_id=str(tenant.id),
            old_tier=old_tier,
        )
        return {
            "action": "subscription_cancelled",
            "tenant_id": str(tenant.id),
            "old_tier": old_tier,
            "new_tier": "starter",
        }

    logger.info(
        "saas.billing.event_ignored",
        event_type=event_type,
        tenant_id=str(tenant.id),
    )
    return {"action": "ignored", "event_type": event_type, "tenant_id": str(tenant.id)}
