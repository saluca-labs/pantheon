"""
Stripe billing webhook handler -- subscription lifecycle -> tenant tier updates.
Implements SAAS-03.

Stripe sends events as JSON to /v1/saas/billing/webhook.
Signature verification is performed via HMAC-SHA256 against STRIPE_WEBHOOK_SECRET.
If STRIPE_WEBHOOK_SECRET is not set, verification is skipped with a warning
(graceful degradation for dev environments).
"""

import hashlib
import hmac
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulTenant
from src.billing.grace import handle_payment_failed, resolve_payment

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


def verify_stripe_signature(raw_body: bytes, signature_header: str) -> bool:
    """
    Verify a Stripe webhook signature using HMAC-SHA256.

    Stripe signature header format:
        t=<timestamp>,v1=<hex-signature>[,v1=<hex-signature>...]

    Verification steps (per Stripe docs):
      1. Extract t= (Unix timestamp) and all v1= values.
      2. Build the signed payload: f"{timestamp}.{raw_body_utf8}".
      3. Compute HMAC-SHA256(webhook_secret, signed_payload).
      4. Compare against each v1 value using constant-time comparison.
      5. Reject if timestamp is older than 5 minutes (replay protection).

    Returns True if valid, False otherwise.
    If STRIPE_WEBHOOK_SECRET is not configured, logs a warning and returns True
    (graceful degradation -- useful in dev/staging without a real webhook secret).
    """
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    if not webhook_secret:
        logger.warning(
            "saas.billing.webhook_secret_missing",
            detail="STRIPE_WEBHOOK_SECRET not set -- skipping signature verification",
        )
        return True

    timestamp: Optional[str] = None
    v1_signatures: list[str] = []

    for part in signature_header.split(","):
        part = part.strip()
        if part.startswith("t="):
            timestamp = part[2:]
        elif part.startswith("v1="):
            v1_signatures.append(part[3:])

    if not timestamp or not v1_signatures:
        logger.warning(
            "saas.billing.webhook_signature_malformed",
            header=signature_header[:120],
        )
        return False

    # Replay protection -- reject events older than 5 minutes
    try:
        event_ts = int(timestamp)
    except ValueError:
        logger.warning("saas.billing.webhook_timestamp_invalid", timestamp=timestamp)
        return False

    age_seconds = int(time.time()) - event_ts
    if age_seconds > 300:
        logger.warning(
            "saas.billing.webhook_replay_rejected",
            age_seconds=age_seconds,
            event_ts=event_ts,
        )
        return False

    # Compute expected HMAC-SHA256 signature
    signed_payload = f"{timestamp}.{raw_body.decode('utf-8', errors='replace')}"
    expected = hmac.new(
        webhook_secret.encode("utf-8"),
        signed_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    for v1 in v1_signatures:
        try:
            if hmac.compare_digest(expected, v1):
                return True
        except (TypeError, ValueError):
            continue

    logger.warning(
        "saas.billing.webhook_signature_mismatch",
        expected_prefix=expected[:8],
    )
    return False


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
    - customer.subscription.deleted -> downgrade to "community" (free tier)
    - customer.subscription.created -> same as updated
    - invoice.paid                  -> clear payment_failed flags, log receipt
    - invoice.payment_failed        -> flag tenant with payment failure metadata

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
            .values(tier="community", updated_at=datetime.now(timezone.utc))
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
            "new_tier": "community",
        }

    elif event_type == "invoice.paid":
        invoice = event_data.get("object", {})
        invoice_id = invoice.get("id", "unknown")
        amount_paid = invoice.get("amount_paid", 0)
        subscription_id = invoice.get("subscription")
        billing_email = invoice.get("customer_email") or invoice.get("email") or ""
        invoice_url = invoice.get("invoice_pdf") or invoice.get("hosted_invoice_url") or ""
        currency = invoice.get("currency", "usd")
        billing_reason = invoice.get("billing_reason", "subscription")
        tier = tenant.tier.title() if tenant else "Pro"
        contact_name = (tenant.name if tenant else None) or "Customer"

        logger.info(
            "saas.billing.invoice_paid",
            tenant_id=str(tenant.id) if tenant else None,
            invoice_id=invoice_id,
            amount_paid=amount_paid,
            subscription_id=subscription_id,
        )

        # Clear any payment_failed flag -- delegate to grace module
        if tenant:
            await resolve_payment(db, tenant.id)

        # Fire payment receipt email (EMAIL-04, non-fatal)
        if billing_email:
            try:
                import asyncio as _asyncio
                from src.email.triggers import on_payment_received as _email_receipt
                _asyncio.create_task(_email_receipt(
                    contact_name=contact_name,
                    contact_email=billing_email,
                    amount_cents=amount_paid,
                    currency=currency,
                    invoice_id=invoice_id,
                    invoice_url=invoice_url,
                    billing_reason=billing_reason,
                    tier=tier,
                ))
            except Exception:
                pass

        return {
            "action": "invoice_paid",
            "tenant_id": str(tenant.id) if tenant else None,
            "invoice_id": invoice_id,
            "amount_paid": amount_paid,
        }

    elif event_type == "invoice.payment_failed":
        invoice = event_data.get("object", {})
        invoice_id = invoice.get("id", "unknown")
        attempt_count = invoice.get("attempt_count", 1)

        logger.error(
            "saas.billing.invoice_payment_failed",
            tenant_id=str(tenant.id) if tenant else None,
            invoice_id=invoice_id,
            attempt_count=attempt_count,
        )

        # Trigger grace period -- delegate to billing.grace module (BILL-04)
        if tenant:
            await handle_payment_failed(db, tenant.id)

        return {
            "action": "payment_failed",
            "tenant_id": str(tenant.id) if tenant else None,
            "invoice_id": invoice_id,
            "attempt_count": attempt_count,
        }

    logger.info(
        "saas.billing.event_ignored",
        event_type=event_type,
        tenant_id=str(tenant.id),
    )
    return {"action": "ignored", "event_type": event_type, "tenant_id": str(tenant.id)}
