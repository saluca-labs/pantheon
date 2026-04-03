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

from src.database.models import SoulTenant, SoulPartner, PolicyCache, AuditLog
from src.billing.grace import handle_payment_failed, resolve_payment
from src.partner.commissions import calculate_split, execute_transfers
from src.tier import VALID_TIERS, DEFAULT_TIER
from src.middleware.tenant import create_tenant, provision_tenant_encryption
from src.auth.soulkey import issue_soulkey

logger = structlog.get_logger(__name__)

# Stripe Price ID -> Tiresias tier mapping.
# Price IDs are configured via env vars (set in k8s/compose) or fallback to hardcoded defaults.
# Separate Stripe products per tier enables per-tier coupon targeting.
import os as _os

def _build_tier_map() -> dict[str, str]:
    """Build tier map from env vars + hardcoded defaults."""
    mapping: dict[str, str] = {
        # Tier name aliases (for metadata.tiresias_tier)
        "community": "community",
        "starter": "starter",
        "pro": "pro",
        "enterprise": "enterprise",
        "mssp": "mssp",
        "saas": "saas",
    }

    # Env-var-configured price IDs (set in k8s deployment or .env)
    _PRICE_ENV_MAP = {
        "STRIPE_PRICE_STARTER_MONTHLY": "starter",
        "STRIPE_PRICE_STARTER_ANNUAL": "starter",
        "STRIPE_PRICE_PRO_MONTHLY": "pro",
        "STRIPE_PRICE_PRO_ANNUAL": "pro",
        "STRIPE_PRICE_ENTERPRISE_MONTHLY": "enterprise",
        "STRIPE_PRICE_ENTERPRISE_ANNUAL": "enterprise",
        "STRIPE_PRICE_MSSP_MONTHLY": "mssp",
        "STRIPE_PRICE_MSSP_ANNUAL": "mssp",
        "STRIPE_PRICE_SAAS_MONTHLY": "saas",
        "STRIPE_PRICE_SAAS_ANNUAL": "saas",
    }

    for env_key, tier in _PRICE_ENV_MAP.items():
        price_id = _os.environ.get(env_key, "")
        if price_id:
            mapping[price_id] = tier
            mapping[price_id.lower()] = tier

    # Hardcoded fallback price IDs (production Stripe account)
    _HARDCODED = {
        "price_1TDMSlBkXMYmrc2L29W09pQl": "starter",
        "price_1TDMSlBkXMYmrc2LuuaUN5Cp": "starter",
        "price_1TDMT2BkXMYmrc2Lhf1whQpi": "pro",
        "price_1TDMT2BkXMYmrc2LnBUoJEww": "pro",
        "price_1TDjH4BkXMYmrc2LBA1vL1qs": "enterprise",
        "price_1TDjH4BkXMYmrc2LeWPVTZT0": "enterprise",
    }

    for price_id, tier in _HARDCODED.items():
        if price_id not in mapping:
            mapping[price_id] = tier

    return mapping


STRIPE_TIER_MAP: dict[str, str] = _build_tier_map()


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


async def _process_partner_commission(
    db: AsyncSession,
    tenant: SoulTenant,
    invoice_id: str,
    amount_paid: int,
    charge_id: str,
    currency: str = "usd",
) -> Optional[dict]:
    """
    Check if a paying tenant was referred by a partner, and if so,
    calculate the commission split and execute Stripe Connect transfers.

    Flow:
      1. Tenant has parent_tenant_id -> look up partner record for the parent
      2. Partner must be active with a verified stripe_connect_account_id
      3. Calculate split (handles 2-party and 3-party cascading)
      4. Execute transfers via Stripe Connect
      5. Audit log the commission event

    Returns transfer details dict or None if no partner commission applies.
    """
    if not tenant.parent_tenant_id:
        return None

    # Look up the partner record for the referring tenant
    result = await db.execute(
        select(SoulPartner).where(
            SoulPartner.tenant_id == tenant.parent_tenant_id,
            SoulPartner.status == "active",
        )
    )
    partner = result.scalar_one_or_none()
    if not partner:
        logger.debug(
            "saas.billing.commission_skip_no_partner",
            tenant_id=str(tenant.id),
            parent_tenant_id=str(tenant.parent_tenant_id),
        )
        return None

    if not partner.stripe_connect_account_id:
        logger.warning(
            "saas.billing.commission_skip_no_connect_account",
            partner_id=str(partner.id),
            partner_name=partner.name,
        )
        return None

    if partner.stripe_connect_status != "active":
        logger.warning(
            "saas.billing.commission_skip_connect_not_active",
            partner_id=str(partner.id),
            connect_status=partner.stripe_connect_status,
        )
        return None

    if amount_paid <= 0:
        return None

    # Calculate the split
    try:
        split = await calculate_split(db, partner.id)
    except Exception as e:
        logger.error(
            "saas.billing.commission_split_failed",
            partner_id=str(partner.id),
            error=str(e),
        )
        return None

    # Execute transfers via Stripe Connect
    transfer_group = f"inv_{invoice_id}"
    try:
        transfers = await execute_transfers(
            charge_id=charge_id,
            amount_cents=amount_paid,
            split=split,
            transfer_group=transfer_group,
        )
    except Exception as e:
        logger.error(
            "saas.billing.commission_transfer_failed",
            partner_id=str(partner.id),
            invoice_id=invoice_id,
            error=str(e),
        )
        return None

    if not transfers:
        return None

    total_transferred = sum(t["amount_cents"] for t in transfers)

    # Audit log the commission event
    try:
        audit = AuditLog(
            tenant_id=tenant.id,
            event_type="partner.commission_transferred",
            resource="billing",
            action="commission_transfer",
            scope="system",
            decision="allow",
            reason=f"Partner commission for invoice {invoice_id}",
            context={
                "source": "stripe_webhook",
                "invoice_id": invoice_id,
                "partner_id": str(partner.id),
                "partner_name": partner.name,
                "amount_paid": amount_paid,
                "currency": currency,
                "total_transferred": total_transferred,
                "is_cascading": split.is_cascading,
                "platform_rate": split.platform_rate,
                "seller_rate": split.seller_rate,
                "seller_net_rate": split.seller_net_rate,
                "recruiter_rate": split.recruiter_rate,
                "transfers": transfers,
                "transfer_group": transfer_group,
            },
        )
        db.add(audit)
    except Exception:
        pass

    logger.info(
        "saas.billing.commission_transferred",
        tenant_id=str(tenant.id),
        partner_id=str(partner.id),
        invoice_id=invoice_id,
        amount_paid=amount_paid,
        total_transferred=total_transferred,
        is_cascading=split.is_cascading,
        transfer_count=len(transfers),
    )

    return {
        "partner_id": str(partner.id),
        "partner_name": partner.name,
        "total_transferred": total_transferred,
        "is_cascading": split.is_cascading,
        "transfers": transfers,
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
        # Indexed lookup by stripe_customer_id column
        result = await db.execute(
            select(SoulTenant).where(SoulTenant.stripe_customer_id == customer_id)
        )
        tenant = result.scalar_one_or_none()

        # Fallback: check metadata_ JSONB for pre-migration tenants
        if tenant is None:
            from sqlalchemy import text
            result = await db.execute(
                text("SELECT id FROM _soul_tenants WHERE metadata_->>'stripe_customer_id' = :cid LIMIT 1"),
                {"cid": customer_id},
            )
            row = result.first()
            if row:
                result = await db.execute(select(SoulTenant).where(SoulTenant.id == row[0]))
                tenant = result.scalar_one_or_none()

    if tenant is None and event_type != "customer.subscription.created":
        logger.warning(
            "saas.billing.tenant_not_found",
            event_type=event_type,
            customer_id=customer_id,
            stripe_tenant_id=stripe_tenant_id,
        )
        return {"action": "tenant_not_found", "customer_id": customer_id}

    if event_type == "customer.subscription.created":
        new_tier = _resolve_tier_from_stripe(event_data) or DEFAULT_TIER

        if tenant is None and customer_id:
            # Auto-provision: new subscription with no existing tenant
            sub_meta = subscription.get("metadata", {})
            company_name = sub_meta.get("company_name", f"Tenant {customer_id[:8]}")
            slug = sub_meta.get("slug") or f"t-{customer_id[-8:].lower()}"

            try:
                tenant = await create_tenant(db, name=company_name, slug=slug, tier=new_tier)

                # Set stripe_customer_id on the new tenant
                tenant.stripe_customer_id = customer_id
                meta = tenant.metadata_ or {}
                meta["stripe_customer_id"] = customer_id
                meta["stripe_subscription_id"] = subscription.get("id")
                tenant.metadata_ = meta
                await db.flush()

                # Provision DEK for encryption
                await provision_tenant_encryption(db, str(tenant.id), tier=new_tier)

                # Issue admin soulkey
                raw_key, soulkey = await issue_soulkey(
                    db=db,
                    tenant_id=tenant.id,
                    persona_id="admin",
                    tenant_short=slug[:8],
                    label=f"Auto-provisioned admin key for {company_name}",
                    metadata={"provisioned_by": "stripe_webhook", "tier": new_tier},
                )

                # Default policy
                policy = PolicyCache(
                    tenant_id=tenant.id,
                    persona_id="admin",
                    policy_version="1.0",
                    resolved_policy={
                        "version": "1.0",
                        "persona_id": "admin",
                        "tenant_id": str(tenant.id),
                        "rules": [{"resource": "*", "action": "*", "scope": "*", "effect": "allow"}],
                        "created_by": "stripe_auto_provision",
                    },
                )
                db.add(policy)

                # Audit log
                audit = AuditLog(
                    tenant_id=tenant.id,
                    event_type="saas.auto_provision",
                    soulkey_id=soulkey.id,
                    persona_id="admin",
                    resource="tenant",
                    action="provision",
                    scope="admin",
                    decision="allow",
                    reason="Auto-provisioned via Stripe subscription.created webhook",
                    context={
                        "stripe_customer_id": customer_id,
                        "tier": new_tier,
                        "source": "stripe_webhook",
                    },
                )
                db.add(audit)
                await db.commit()

                logger.info(
                    "saas.billing.auto_provisioned",
                    tenant_id=str(tenant.id),
                    slug=slug,
                    tier=new_tier,
                    customer_id=customer_id,
                )
                return {
                    "action": "auto_provisioned",
                    "tenant_id": str(tenant.id),
                    "tier": new_tier,
                    "raw_key_issued": True,
                }

            except Exception as e:
                logger.error("saas.billing.auto_provision_failed", error=str(e), customer_id=customer_id)
                return {"action": "auto_provision_failed", "error": str(e)}

        elif tenant is not None:
            # Existing tenant, subscription.created = update tier
            old_tier = tenant.tier
            now = datetime.now(timezone.utc)
            update_values = {"tier": new_tier, "updated_at": now}
            if customer_id and not tenant.stripe_customer_id:
                update_values["stripe_customer_id"] = customer_id
            await db.execute(
                update(SoulTenant).where(SoulTenant.id == tenant.id).values(**update_values)
            )
            # Store subscription ID in metadata
            meta = dict(tenant.metadata_ or {})
            meta["stripe_subscription_id"] = subscription.get("id")
            if customer_id:
                meta["stripe_customer_id"] = customer_id
            await db.execute(
                update(SoulTenant).where(SoulTenant.id == tenant.id).values(metadata_=meta)
            )

            # Emit tier_changed audit event with legitimate source tag
            try:
                audit = AuditLog(
                    tenant_id=tenant.id,
                    event_type="tier_changed",
                    resource="tenant",
                    action="tier_update",
                    scope="admin",
                    decision="allow",
                    reason=f"Tier changed from {old_tier} to {new_tier} via Stripe subscription",
                    context={"source": "stripe_webhook", "old_tier": old_tier, "new_tier": new_tier},
                )
                db.add(audit)
            except Exception:
                pass

            logger.info(
                "saas.billing.tier_updated",
                tenant_id=str(tenant.id),
                old_tier=old_tier,
                new_tier=new_tier,
            )
            return {"action": "tier_updated", "tenant_id": str(tenant.id), "old_tier": old_tier, "new_tier": new_tier}

        return {"action": "tenant_not_found", "customer_id": customer_id}

    elif event_type == "customer.subscription.updated":
        new_tier = _resolve_tier_from_stripe(event_data)
        if not new_tier:
            logger.warning("saas.billing.tier_unresolvable", tenant_id=str(tenant.id) if tenant else None)
            return {"action": "tier_unresolvable", "tenant_id": str(tenant.id) if tenant else None}

        old_tier = tenant.tier
        now = datetime.now(timezone.utc)

        update_values = {"tier": new_tier, "updated_at": now}
        if customer_id and not tenant.stripe_customer_id:
            update_values["stripe_customer_id"] = customer_id
        await db.execute(
            update(SoulTenant).where(SoulTenant.id == tenant.id).values(**update_values)
        )

        # Emit tier_changed audit event with legitimate source tag
        if old_tier != new_tier:
            try:
                audit = AuditLog(
                    tenant_id=tenant.id,
                    event_type="tier_changed",
                    resource="tenant",
                    action="tier_update",
                    scope="admin",
                    decision="allow",
                    reason=f"Tier changed from {old_tier} to {new_tier} via Stripe subscription update",
                    context={"source": "stripe_webhook", "old_tier": old_tier, "new_tier": new_tier},
                )
                db.add(audit)
            except Exception:
                pass

        logger.info(
            "saas.billing.tier_updated",
            tenant_id=str(tenant.id),
            old_tier=old_tier,
            new_tier=new_tier,
            event_type=event_type,
        )
        return {"action": "tier_updated", "tenant_id": str(tenant.id), "old_tier": old_tier, "new_tier": new_tier}

    elif event_type == "customer.subscription.deleted":
        old_tier = tenant.tier
        now = datetime.now(timezone.utc)
        await db.execute(
            update(SoulTenant)
            .where(SoulTenant.id == tenant.id)
            .values(tier=DEFAULT_TIER, updated_at=now)
        )

        # Emit tier_changed audit event
        try:
            audit = AuditLog(
                tenant_id=tenant.id,
                event_type="tier_changed",
                resource="tenant",
                action="tier_update",
                scope="admin",
                decision="allow",
                reason=f"Subscription cancelled. Tier downgraded from {old_tier} to {DEFAULT_TIER}",
                context={"source": "stripe_webhook", "old_tier": old_tier, "new_tier": DEFAULT_TIER},
            )
            db.add(audit)
        except Exception:
            pass

        logger.info(
            "saas.billing.subscription_cancelled",
            tenant_id=str(tenant.id),
            old_tier=old_tier,
        )
        return {
            "action": "subscription_cancelled",
            "tenant_id": str(tenant.id),
            "old_tier": old_tier,
            "new_tier": DEFAULT_TIER,
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

        # --- Partner commission transfers (PARTNER-COMM) ---
        # If the paying tenant was referred by a partner, calculate and execute
        # commission transfers via Stripe Connect.
        commission_result = None
        if tenant and amount_paid > 0:
            # Extract charge ID from the invoice for source_transaction on transfers.
            # Stripe 2023+: invoice.charge is the charge ID string.
            # Stripe 2024+: may be under payment_intent -> latest_charge.
            charge_id = invoice.get("charge")
            if not charge_id:
                # Fallback: try payment_intent.latest_charge
                pi = invoice.get("payment_intent")
                if isinstance(pi, dict):
                    charge_id = pi.get("latest_charge")
                elif isinstance(pi, str) and pi.startswith("pi_"):
                    # We only have the PI ID, not the charge. Transfers require a charge.
                    # Log and skip -- charge will be available on the charge.succeeded event.
                    logger.debug(
                        "saas.billing.commission_deferred_no_charge",
                        invoice_id=invoice_id,
                        payment_intent=pi,
                    )

            if charge_id:
                commission_result = await _process_partner_commission(
                    db=db,
                    tenant=tenant,
                    invoice_id=invoice_id,
                    amount_paid=amount_paid,
                    charge_id=charge_id,
                    currency=currency,
                )

        result = {
            "action": "invoice_paid",
            "tenant_id": str(tenant.id) if tenant else None,
            "invoice_id": invoice_id,
            "amount_paid": amount_paid,
        }
        if commission_result:
            result["commission"] = commission_result
        return result

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

            # Check if this is a repeated failure — escalate to suspension after 3 attempts
            if attempt_count >= 3:
                try:
                    from src.tenant.offboard import offboard_tenant
                    await offboard_tenant(db, tenant.id, offboarded_by="payment_cascade", purge_dek=False)
                    logger.warning(
                        "saas.billing.tenant_suspended_payment_failure",
                        tenant_id=str(tenant.id),
                        attempt_count=attempt_count,
                    )
                except Exception as e:
                    logger.error("saas.billing.suspension_cascade_failed", error=str(e))

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
