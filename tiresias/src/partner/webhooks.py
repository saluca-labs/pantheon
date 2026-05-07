"""
Stripe partner webhook handler -- Connect, billing, payouts, risk, and metering events.

Handles partner-specific Stripe events on a dedicated endpoint:
  POST /v1/stripe/partner-webhooks

Signature verification is performed via HMAC-SHA256 against STRIPE_PARTNER_WEBHOOK_SECRET.
All events are deduplicated via the _stripe_webhook_events idempotency table.
Each event type routes to a specific handler function; unknown events return 200 (no-op).

Connect:  account.updated, account.application.deauthorized
Billing:  invoice.paid, invoice.payment_failed, invoice.finalized,
          customer.subscription.updated, customer.subscription.deleted
Payouts:  transfer.created, transfer.failed, payout.paid, payout.failed
Risk:     charge.dispute.created, charge.dispute.closed
Metering: invoice.upcoming
"""

import hashlib
import hmac
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
import structlog
from sqlalchemy import select, update, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulPartner, AuditLog

logger = structlog.get_logger(__name__)

STRIPE_API_BASE = "https://api.stripe.com/v1"


def _stripe_key() -> str:
    key = os.getenv("STRIPE_SECRET_KEY", "")
    if not key:
        raise RuntimeError("STRIPE_SECRET_KEY env var not set")
    return key


# ---------------------------------------------------------------------------
# Signature verification
# ---------------------------------------------------------------------------

def verify_partner_webhook_signature(raw_body: bytes, signature_header: str) -> bool:
    """
    Verify Stripe webhook signature using HMAC-SHA256 against STRIPE_PARTNER_WEBHOOK_SECRET.

    Stripe signature header format:
        t=<timestamp>,v1=<hex-signature>[,v1=<hex-signature>...]

    Returns True if valid, False otherwise.
    If STRIPE_PARTNER_WEBHOOK_SECRET is not configured, logs a warning and returns True
    (graceful degradation for dev environments).
    """
    webhook_secret = os.environ.get("STRIPE_PARTNER_WEBHOOK_SECRET", "")
    if not webhook_secret:
        logger.warning(
            "partner.webhook.secret_missing",
            detail="STRIPE_PARTNER_WEBHOOK_SECRET not set, skipping signature verification",
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
            "partner.webhook.signature_malformed",
            header=signature_header[:120],
        )
        return False

    # Replay protection: reject events older than 5 minutes
    try:
        event_ts = int(timestamp)
    except ValueError:
        logger.warning("partner.webhook.timestamp_invalid", timestamp=timestamp)
        return False

    age_seconds = int(time.time()) - event_ts
    if age_seconds > 300:
        logger.warning(
            "partner.webhook.replay_rejected",
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
        "partner.webhook.signature_mismatch",
        expected_prefix=expected[:8],
    )
    return False


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------

async def _check_idempotency(db: AsyncSession, event_id: str) -> bool:
    """Return True if event_id has already been processed (duplicate)."""
    result = await db.execute(
        text("SELECT event_id FROM _stripe_webhook_events WHERE event_id = :eid LIMIT 1"),
        {"eid": event_id},
    )
    return result.first() is not None


async def _record_event(
    db: AsyncSession,
    event_id: str,
    event_type: str,
    handler_result: str = "success",
    metadata_: Optional[dict] = None,
) -> None:
    """Record a processed webhook event in the idempotency table."""
    await db.execute(
        text(
            "INSERT INTO _stripe_webhook_events (id, event_id, event_type, handler_result, metadata_) "
            "VALUES (:id, :event_id, :event_type, :handler_result, CAST(:meta AS JSON)) "
            "ON CONFLICT (event_id) DO NOTHING"
        ),
        {
            "id": str(uuid.uuid4()),
            "event_id": event_id,
            "event_type": event_type,
            "handler_result": handler_result,
            "meta": __import__("json").dumps(metadata_) if metadata_ else None,
        },
    )


# ---------------------------------------------------------------------------
# Audit helper
# ---------------------------------------------------------------------------

async def _audit_partner_event(
    db: AsyncSession,
    partner: SoulPartner,
    event_type: str,
    action: str,
    reason: str,
    context: dict,
) -> None:
    """Write a structured audit log entry for a partner webhook event."""
    try:
        audit = AuditLog(
            tenant_id=partner.tenant_id,
            event_type=event_type,
            resource="partner",
            action=action,
            scope="system",
            decision="allow",
            reason=reason,
            context={"source": "stripe_partner_webhook", "partner_id": str(partner.id), **context},
        )
        db.add(audit)
    except Exception:
        logger.debug("partner.webhook.audit_write_failed", partner_id=str(partner.id))


# ---------------------------------------------------------------------------
# Partner lookup helpers
# ---------------------------------------------------------------------------

async def _find_partner_by_connect_account(
    db: AsyncSession, account_id: str
) -> Optional[SoulPartner]:
    """Look up a partner by their Stripe Connect account ID."""
    result = await db.execute(
        select(SoulPartner).where(SoulPartner.stripe_connect_account_id == account_id)
    )
    return result.scalar_one_or_none()


async def _find_partner_by_customer_id(
    db: AsyncSession, customer_id: str
) -> Optional[SoulPartner]:
    """Look up a partner by Stripe customer ID stored in partner metadata."""
    result = await db.execute(
        text(
            "SELECT id FROM _soul_partners "
            "WHERE metadata_->>'stripe_customer_id' = :cid LIMIT 1"
        ),
        {"cid": customer_id},
    )
    row = result.first()
    if not row:
        return None
    result2 = await db.execute(select(SoulPartner).where(SoulPartner.id == row[0]))
    return result2.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Connect event handlers
# ---------------------------------------------------------------------------

async def handle_account_updated(db: AsyncSession, event_data: dict) -> dict:
    """
    Handle account.updated: update partner Connect status in DB.
    Checks charges_enabled, payouts_enabled, details_submitted.
    """
    account = event_data.get("object", {})
    account_id = account.get("id", "")

    partner = await _find_partner_by_connect_account(db, account_id)
    if not partner:
        logger.info("partner.webhook.account_updated.no_partner", account_id=account_id)
        return {"action": "skipped", "reason": "no_matching_partner", "account_id": account_id}

    charges_enabled = account.get("charges_enabled", False)
    payouts_enabled = account.get("payouts_enabled", False)
    details_submitted = account.get("details_submitted", False)
    requirements = account.get("requirements", {})

    # Determine new connect status
    old_status = partner.stripe_connect_status
    if charges_enabled and payouts_enabled:
        new_status = "active"
    elif details_submitted:
        new_status = "pending_verification"
    else:
        new_status = "pending"

    # If account has been disabled, mark as suspended
    if old_status == "active" and not (charges_enabled and payouts_enabled):
        new_status = "suspended"

    await db.execute(
        update(SoulPartner)
        .where(SoulPartner.id == partner.id)
        .values(stripe_connect_status=new_status)
    )

    # Store requirements in partner metadata
    meta = dict(partner.metadata_ or {})
    meta["connect_charges_enabled"] = charges_enabled
    meta["connect_payouts_enabled"] = payouts_enabled
    meta["connect_details_submitted"] = details_submitted
    meta["connect_requirements_due"] = requirements.get("currently_due", [])
    await db.execute(
        update(SoulPartner).where(SoulPartner.id == partner.id).values(metadata_=meta)
    )

    await _audit_partner_event(
        db, partner, "partner.connect_status_changed", "connect_update",
        f"Connect status changed from {old_status} to {new_status}",
        {
            "old_status": old_status,
            "new_status": new_status,
            "charges_enabled": charges_enabled,
            "payouts_enabled": payouts_enabled,
            "details_submitted": details_submitted,
        },
    )

    logger.info(
        "partner.webhook.account_updated",
        partner_id=str(partner.id),
        account_id=account_id,
        old_status=old_status,
        new_status=new_status,
        charges_enabled=charges_enabled,
        payouts_enabled=payouts_enabled,
    )
    return {
        "action": "account_updated",
        "partner_id": str(partner.id),
        "old_status": old_status,
        "new_status": new_status,
    }


async def handle_connect_deauthorized(db: AsyncSession, event_data: dict) -> dict:
    """Handle account.application.deauthorized: partner disconnected their Stripe account."""
    account = event_data.get("object", {})
    account_id = account.get("id", "")

    partner = await _find_partner_by_connect_account(db, account_id)
    if not partner:
        logger.info("partner.webhook.deauthorized.no_partner", account_id=account_id)
        return {"action": "skipped", "reason": "no_matching_partner", "account_id": account_id}

    old_status = partner.stripe_connect_status
    await db.execute(
        update(SoulPartner)
        .where(SoulPartner.id == partner.id)
        .values(stripe_connect_status="disconnected")
    )

    await _audit_partner_event(
        db, partner, "partner.connect_deauthorized", "connect_deauthorize",
        "Partner disconnected Stripe account from platform",
        {"old_status": old_status, "account_id": account_id},
    )

    logger.warning(
        "partner.webhook.deauthorized",
        partner_id=str(partner.id),
        account_id=account_id,
    )
    return {"action": "deauthorized", "partner_id": str(partner.id)}


# ---------------------------------------------------------------------------
# Billing event handlers
# ---------------------------------------------------------------------------

async def handle_invoice_paid(db: AsyncSession, event_data: dict) -> dict:
    """Handle invoice.paid: record successful partner subscription payment."""
    invoice = event_data.get("object", {})
    customer_id = invoice.get("customer", "")
    invoice_id = invoice.get("id", "unknown")
    amount_paid = invoice.get("amount_paid", 0)
    subscription_id = invoice.get("subscription")

    # Only process partner invoices (check metadata)
    meta = invoice.get("metadata", {})
    if meta.get("partner_eligible") != "true" and not meta.get("partner_id"):
        # Also check subscription metadata via lines
        lines = invoice.get("lines", {}).get("data", [])
        is_partner = any(
            line.get("metadata", {}).get("partner_eligible") == "true"
            or line.get("price", {}).get("metadata", {}).get("partner_eligible") == "true"
            for line in lines
        )
        if not is_partner:
            # Try partner lookup by customer_id as final check
            partner = await _find_partner_by_customer_id(db, customer_id)
            if not partner:
                return {"action": "skipped", "reason": "not_partner_invoice", "invoice_id": invoice_id}

    partner = await _find_partner_by_customer_id(db, customer_id)
    if not partner:
        logger.info("partner.webhook.invoice_paid.no_partner", customer_id=customer_id)
        return {"action": "skipped", "reason": "no_matching_partner", "customer_id": customer_id}

    await _audit_partner_event(
        db, partner, "partner.invoice_paid", "payment_received",
        f"Partner subscription payment received: {amount_paid} cents",
        {
            "invoice_id": invoice_id,
            "amount_paid": amount_paid,
            "subscription_id": subscription_id,
            "currency": invoice.get("currency", "usd"),
        },
    )

    logger.info(
        "partner.webhook.invoice_paid",
        partner_id=str(partner.id),
        invoice_id=invoice_id,
        amount_paid=amount_paid,
    )
    return {
        "action": "invoice_paid",
        "partner_id": str(partner.id),
        "invoice_id": invoice_id,
        "amount_paid": amount_paid,
    }


async def handle_invoice_payment_failed(db: AsyncSession, event_data: dict) -> dict:
    """Handle invoice.payment_failed: flag partner account, trigger notification."""
    invoice = event_data.get("object", {})
    customer_id = invoice.get("customer", "")
    invoice_id = invoice.get("id", "unknown")
    attempt_count = invoice.get("attempt_count", 1)

    partner = await _find_partner_by_customer_id(db, customer_id)
    if not partner:
        return {"action": "skipped", "reason": "no_matching_partner", "customer_id": customer_id}

    # Flag the partner account
    meta = dict(partner.metadata_ or {})
    meta["payment_failed"] = True
    meta["payment_failed_at"] = datetime.now(timezone.utc).isoformat()
    meta["payment_attempt_count"] = attempt_count
    await db.execute(
        update(SoulPartner).where(SoulPartner.id == partner.id).values(metadata_=meta)
    )

    # Suspend after 3 failures
    if attempt_count >= 3:
        await db.execute(
            update(SoulPartner)
            .where(SoulPartner.id == partner.id)
            .values(status="suspended")
        )
        logger.warning(
            "partner.webhook.payment_failed.suspended",
            partner_id=str(partner.id),
            attempt_count=attempt_count,
        )

    await _audit_partner_event(
        db, partner, "partner.payment_failed", "payment_failed",
        f"Partner payment failed (attempt {attempt_count})",
        {
            "invoice_id": invoice_id,
            "attempt_count": attempt_count,
        },
    )

    logger.error(
        "partner.webhook.invoice_payment_failed",
        partner_id=str(partner.id),
        invoice_id=invoice_id,
        attempt_count=attempt_count,
    )
    return {
        "action": "payment_failed",
        "partner_id": str(partner.id),
        "invoice_id": invoice_id,
        "attempt_count": attempt_count,
    }


async def handle_invoice_finalized(db: AsyncSession, event_data: dict) -> dict:
    """Handle invoice.finalized: record invoice line items for reconciliation audit trail."""
    invoice = event_data.get("object", {})
    customer_id = invoice.get("customer", "")
    invoice_id = invoice.get("id", "unknown")

    partner = await _find_partner_by_customer_id(db, customer_id)
    if not partner:
        return {"action": "skipped", "reason": "no_matching_partner", "customer_id": customer_id}

    lines = invoice.get("lines", {}).get("data", [])
    line_summary = [
        {
            "description": line.get("description"),
            "amount": line.get("amount"),
            "quantity": line.get("quantity"),
            "price_id": line.get("price", {}).get("id") if isinstance(line.get("price"), dict) else None,
        }
        for line in lines
    ]

    await _audit_partner_event(
        db, partner, "partner.invoice_finalized", "invoice_finalized",
        f"Partner invoice finalized: {invoice_id}",
        {
            "invoice_id": invoice_id,
            "total": invoice.get("total", 0),
            "currency": invoice.get("currency", "usd"),
            "line_items": line_summary,
        },
    )

    logger.info(
        "partner.webhook.invoice_finalized",
        partner_id=str(partner.id),
        invoice_id=invoice_id,
        line_count=len(lines),
    )
    return {
        "action": "invoice_finalized",
        "partner_id": str(partner.id),
        "invoice_id": invoice_id,
    }


async def handle_subscription_updated(db: AsyncSession, event_data: dict) -> dict:
    """Handle customer.subscription.updated: update partner tier/status if subscription changes."""
    subscription = event_data.get("object", {})
    customer_id = subscription.get("customer", "")
    subscription_id = subscription.get("id", "unknown")
    sub_status = subscription.get("status", "")
    cancel_at_period_end = subscription.get("cancel_at_period_end", False)

    partner = await _find_partner_by_customer_id(db, customer_id)
    if not partner:
        return {"action": "skipped", "reason": "no_matching_partner", "customer_id": customer_id}

    # Update partner metadata with subscription state
    meta = dict(partner.metadata_ or {})
    meta["stripe_subscription_id"] = subscription_id
    meta["stripe_subscription_status"] = sub_status
    meta["cancel_at_period_end"] = cancel_at_period_end
    await db.execute(
        update(SoulPartner).where(SoulPartner.id == partner.id).values(metadata_=meta)
    )

    # If subscription went past_due or unpaid, flag the partner
    if sub_status in ("past_due", "unpaid"):
        await db.execute(
            update(SoulPartner)
            .where(SoulPartner.id == partner.id)
            .values(status="payment_issue")
        )

    await _audit_partner_event(
        db, partner, "partner.subscription_updated", "subscription_update",
        f"Partner subscription updated: status={sub_status}",
        {
            "subscription_id": subscription_id,
            "subscription_status": sub_status,
            "cancel_at_period_end": cancel_at_period_end,
        },
    )

    logger.info(
        "partner.webhook.subscription_updated",
        partner_id=str(partner.id),
        subscription_id=subscription_id,
        status=sub_status,
        cancel_at_period_end=cancel_at_period_end,
    )
    return {
        "action": "subscription_updated",
        "partner_id": str(partner.id),
        "subscription_id": subscription_id,
        "status": sub_status,
    }


async def handle_subscription_deleted(db: AsyncSession, event_data: dict) -> dict:
    """Handle customer.subscription.deleted: deactivate partner if subscription cancelled."""
    subscription = event_data.get("object", {})
    customer_id = subscription.get("customer", "")
    subscription_id = subscription.get("id", "unknown")

    partner = await _find_partner_by_customer_id(db, customer_id)
    if not partner:
        return {"action": "skipped", "reason": "no_matching_partner", "customer_id": customer_id}

    old_status = partner.status
    await db.execute(
        update(SoulPartner)
        .where(SoulPartner.id == partner.id)
        .values(status="churned")
    )

    # Mark subscription as deleted in metadata
    meta = dict(partner.metadata_ or {})
    meta["stripe_subscription_status"] = "canceled"
    meta["churned_at"] = datetime.now(timezone.utc).isoformat()
    await db.execute(
        update(SoulPartner).where(SoulPartner.id == partner.id).values(metadata_=meta)
    )

    await _audit_partner_event(
        db, partner, "partner.subscription_deleted", "subscription_cancel",
        f"Partner subscription cancelled, status changed from {old_status} to churned",
        {
            "subscription_id": subscription_id,
            "old_status": old_status,
        },
    )

    logger.warning(
        "partner.webhook.subscription_deleted",
        partner_id=str(partner.id),
        subscription_id=subscription_id,
        old_status=old_status,
    )
    return {
        "action": "subscription_deleted",
        "partner_id": str(partner.id),
        "subscription_id": subscription_id,
        "old_status": old_status,
    }


# ---------------------------------------------------------------------------
# Payout event handlers
# ---------------------------------------------------------------------------

async def handle_transfer_created(db: AsyncSession, event_data: dict) -> dict:
    """Handle transfer.created: log successful commission transfer."""
    transfer = event_data.get("object", {})
    transfer_id = transfer.get("id", "unknown")
    destination = transfer.get("destination", "")
    amount = transfer.get("amount", 0)
    currency = transfer.get("currency", "usd")
    transfer_meta = transfer.get("metadata", {})

    partner = await _find_partner_by_connect_account(db, destination)
    if not partner:
        logger.info("partner.webhook.transfer_created.no_partner", destination=destination)
        return {"action": "logged", "reason": "no_matching_partner", "transfer_id": transfer_id}

    await _audit_partner_event(
        db, partner, "partner.transfer_created", "transfer_created",
        f"Commission transfer created: {amount} {currency}",
        {
            "transfer_id": transfer_id,
            "amount": amount,
            "currency": currency,
            "transfer_type": transfer_meta.get("type", "unknown"),
            "transfer_group": transfer.get("transfer_group"),
        },
    )

    logger.info(
        "partner.webhook.transfer_created",
        partner_id=str(partner.id),
        transfer_id=transfer_id,
        amount=amount,
        currency=currency,
    )
    return {
        "action": "transfer_created",
        "partner_id": str(partner.id),
        "transfer_id": transfer_id,
        "amount": amount,
    }


async def handle_transfer_failed(db: AsyncSession, event_data: dict) -> dict:
    """Handle transfer.failed: log failure, trigger admin notification."""
    transfer = event_data.get("object", {})
    transfer_id = transfer.get("id", "unknown")
    destination = transfer.get("destination", "")
    amount = transfer.get("amount", 0)

    partner = await _find_partner_by_connect_account(db, destination)
    if not partner:
        logger.warning("partner.webhook.transfer_failed.no_partner", destination=destination)
        return {"action": "logged", "reason": "no_matching_partner", "transfer_id": transfer_id}

    # Store failure in partner metadata
    meta = dict(partner.metadata_ or {})
    meta["last_transfer_failure"] = {
        "transfer_id": transfer_id,
        "amount": amount,
        "failed_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.execute(
        update(SoulPartner).where(SoulPartner.id == partner.id).values(metadata_=meta)
    )

    await _audit_partner_event(
        db, partner, "partner.transfer_failed", "transfer_failed",
        f"Commission transfer failed: {transfer_id}",
        {
            "transfer_id": transfer_id,
            "amount": amount,
            "destination": destination,
        },
    )

    logger.error(
        "partner.webhook.transfer_failed",
        partner_id=str(partner.id),
        transfer_id=transfer_id,
        amount=amount,
    )
    return {
        "action": "transfer_failed",
        "partner_id": str(partner.id),
        "transfer_id": transfer_id,
        "amount": amount,
    }


async def handle_payout_paid(db: AsyncSession, event_data: dict) -> dict:
    """Handle payout.paid: log payout completion."""
    payout = event_data.get("object", {})
    payout_id = payout.get("id", "unknown")
    amount = payout.get("amount", 0)
    currency = payout.get("currency", "usd")

    # Payout events on connected accounts include the account in the top-level event
    # The caller passes account from event.account
    account_id = event_data.get("_connect_account_id", "")

    partner = await _find_partner_by_connect_account(db, account_id) if account_id else None
    if not partner:
        logger.info("partner.webhook.payout_paid.no_partner", payout_id=payout_id)
        return {"action": "logged", "payout_id": payout_id, "amount": amount}

    await _audit_partner_event(
        db, partner, "partner.payout_paid", "payout_completed",
        f"Payout completed: {amount} {currency}",
        {
            "payout_id": payout_id,
            "amount": amount,
            "currency": currency,
            "arrival_date": payout.get("arrival_date"),
        },
    )

    logger.info(
        "partner.webhook.payout_paid",
        partner_id=str(partner.id),
        payout_id=payout_id,
        amount=amount,
    )
    return {
        "action": "payout_paid",
        "partner_id": str(partner.id),
        "payout_id": payout_id,
        "amount": amount,
    }


async def handle_payout_failed(db: AsyncSession, event_data: dict) -> dict:
    """Handle payout.failed: flag partner, trigger notification."""
    payout = event_data.get("object", {})
    payout_id = payout.get("id", "unknown")
    amount = payout.get("amount", 0)

    account_id = event_data.get("_connect_account_id", "")

    partner = await _find_partner_by_connect_account(db, account_id) if account_id else None
    if not partner:
        logger.warning("partner.webhook.payout_failed.no_partner", payout_id=payout_id)
        return {"action": "logged", "payout_id": payout_id, "amount": amount}

    # Flag partner
    meta = dict(partner.metadata_ or {})
    meta["payout_failed"] = True
    meta["last_payout_failure"] = {
        "payout_id": payout_id,
        "amount": amount,
        "failed_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.execute(
        update(SoulPartner).where(SoulPartner.id == partner.id).values(metadata_=meta)
    )

    await _audit_partner_event(
        db, partner, "partner.payout_failed", "payout_failed",
        f"Payout failed: {payout_id}",
        {
            "payout_id": payout_id,
            "amount": amount,
            "failure_code": payout.get("failure_code"),
            "failure_message": payout.get("failure_message"),
        },
    )

    logger.error(
        "partner.webhook.payout_failed",
        partner_id=str(partner.id),
        payout_id=payout_id,
        amount=amount,
    )
    return {
        "action": "payout_failed",
        "partner_id": str(partner.id),
        "payout_id": payout_id,
        "amount": amount,
    }


# ---------------------------------------------------------------------------
# Risk event handlers
# ---------------------------------------------------------------------------

async def handle_dispute_created(db: AsyncSession, event_data: dict) -> dict:
    """Handle charge.dispute.created: flag partner, log dispute."""
    dispute = event_data.get("object", {})
    dispute_id = dispute.get("id", "unknown")
    charge_id = dispute.get("charge", "")
    amount = dispute.get("amount", 0)
    reason = dispute.get("reason", "general")

    # Try to find partner via Connect account (dispute on connected account)
    account_id = event_data.get("_connect_account_id", "")
    partner = await _find_partner_by_connect_account(db, account_id) if account_id else None

    if not partner:
        logger.info("partner.webhook.dispute_created.no_partner", dispute_id=dispute_id)
        return {"action": "logged", "dispute_id": dispute_id}

    # Flag partner with dispute info
    meta = dict(partner.metadata_ or {})
    disputes = meta.get("open_disputes", [])
    disputes.append({
        "dispute_id": dispute_id,
        "charge_id": charge_id,
        "amount": amount,
        "reason": reason,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    meta["open_disputes"] = disputes
    meta["has_open_dispute"] = True
    await db.execute(
        update(SoulPartner).where(SoulPartner.id == partner.id).values(metadata_=meta)
    )

    await _audit_partner_event(
        db, partner, "partner.dispute_created", "dispute_created",
        f"Charge dispute created: {dispute_id}, reason: {reason}",
        {
            "dispute_id": dispute_id,
            "charge_id": charge_id,
            "amount": amount,
            "reason": reason,
        },
    )

    logger.warning(
        "partner.webhook.dispute_created",
        partner_id=str(partner.id),
        dispute_id=dispute_id,
        charge_id=charge_id,
        amount=amount,
        reason=reason,
    )
    return {
        "action": "dispute_created",
        "partner_id": str(partner.id),
        "dispute_id": dispute_id,
        "amount": amount,
        "reason": reason,
    }


async def handle_dispute_closed(db: AsyncSession, event_data: dict) -> dict:
    """Handle charge.dispute.closed: update dispute status."""
    dispute = event_data.get("object", {})
    dispute_id = dispute.get("id", "unknown")
    status = dispute.get("status", "unknown")

    account_id = event_data.get("_connect_account_id", "")
    partner = await _find_partner_by_connect_account(db, account_id) if account_id else None

    if not partner:
        logger.info("partner.webhook.dispute_closed.no_partner", dispute_id=dispute_id)
        return {"action": "logged", "dispute_id": dispute_id}

    # Remove dispute from open list
    meta = dict(partner.metadata_ or {})
    open_disputes = meta.get("open_disputes", [])
    meta["open_disputes"] = [d for d in open_disputes if d.get("dispute_id") != dispute_id]
    meta["has_open_dispute"] = len(meta["open_disputes"]) > 0
    await db.execute(
        update(SoulPartner).where(SoulPartner.id == partner.id).values(metadata_=meta)
    )

    await _audit_partner_event(
        db, partner, "partner.dispute_closed", "dispute_closed",
        f"Charge dispute closed: {dispute_id}, outcome: {status}",
        {
            "dispute_id": dispute_id,
            "status": status,
        },
    )

    logger.info(
        "partner.webhook.dispute_closed",
        partner_id=str(partner.id),
        dispute_id=dispute_id,
        status=status,
    )
    return {
        "action": "dispute_closed",
        "partner_id": str(partner.id),
        "dispute_id": dispute_id,
        "status": status,
    }


# ---------------------------------------------------------------------------
# Metering event handler
# ---------------------------------------------------------------------------

async def handle_invoice_upcoming(db: AsyncSession, event_data: dict) -> dict:
    """
    Handle invoice.upcoming: report metered usage (tenant count) for MSSP partners.
    Reports current active sub-tenant count as a usage record on the metered subscription item.
    """
    invoice = event_data.get("object", {})
    customer_id = invoice.get("customer", "")
    subscription_id = invoice.get("subscription")

    partner = await _find_partner_by_customer_id(db, customer_id)
    if not partner:
        return {"action": "skipped", "reason": "no_matching_partner", "customer_id": customer_id}

    # Count active sub-tenants under this partner's tenant
    result = await db.execute(
        text(
            "SELECT COUNT(*) FROM _soul_tenants "
            "WHERE parent_tenant_id = :tid AND status = 'active'"
        ),
        {"tid": str(partner.tenant_id)},
    )
    tenant_count = result.scalar() or 0

    if tenant_count == 0 or not subscription_id:
        logger.info(
            "partner.webhook.invoice_upcoming.no_usage",
            partner_id=str(partner.id),
            tenant_count=tenant_count,
        )
        return {
            "action": "no_usage_reported",
            "partner_id": str(partner.id),
            "tenant_count": tenant_count,
        }

    # Find the metered subscription item
    # Look up the subscription to get the metered item ID
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{STRIPE_API_BASE}/subscriptions/{subscription_id}",
                auth=(_stripe_key(), ""),
                timeout=15.0,
            )
            resp.raise_for_status()
            sub = resp.json()
    except Exception as e:
        logger.error(
            "partner.webhook.invoice_upcoming.subscription_fetch_failed",
            subscription_id=subscription_id,
            error=str(e),
        )
        return {"action": "error", "error": "subscription_fetch_failed"}

    # Find the metered price item
    metered_item_id = None
    for item in sub.get("items", {}).get("data", []):
        price = item.get("price", {})
        if price.get("recurring", {}).get("usage_type") == "metered":
            metered_item_id = item.get("id")
            break
        # Also check by lookup key
        if price.get("lookup_key") == "tiresias_mssp_per_tenant":
            metered_item_id = item.get("id")
            break

    if not metered_item_id:
        logger.info(
            "partner.webhook.invoice_upcoming.no_metered_item",
            partner_id=str(partner.id),
            subscription_id=subscription_id,
        )
        return {"action": "no_metered_item", "partner_id": str(partner.id)}

    # Report usage
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{STRIPE_API_BASE}/subscription_items/{metered_item_id}/usage_records",
                auth=(_stripe_key(), ""),
                data={
                    "quantity": tenant_count,
                    "action": "set",
                },
                timeout=15.0,
            )
            resp.raise_for_status()
            usage_record = resp.json()
    except Exception as e:
        logger.error(
            "partner.webhook.invoice_upcoming.usage_report_failed",
            partner_id=str(partner.id),
            metered_item_id=metered_item_id,
            tenant_count=tenant_count,
            error=str(e),
        )
        return {"action": "error", "error": "usage_report_failed"}

    await _audit_partner_event(
        db, partner, "partner.usage_reported", "metered_usage",
        f"Reported {tenant_count} tenants for metered billing",
        {
            "subscription_id": subscription_id,
            "metered_item_id": metered_item_id,
            "tenant_count": tenant_count,
            "usage_record_id": usage_record.get("id"),
        },
    )

    logger.info(
        "partner.webhook.usage_reported",
        partner_id=str(partner.id),
        tenant_count=tenant_count,
        subscription_id=subscription_id,
    )
    return {
        "action": "usage_reported",
        "partner_id": str(partner.id),
        "tenant_count": tenant_count,
        "usage_record_id": usage_record.get("id"),
    }


# ---------------------------------------------------------------------------
# Event routing
# ---------------------------------------------------------------------------

EVENT_HANDLER_MAP: dict[str, Any] = {
    "account.updated": handle_account_updated,
    "account.application.deauthorized": handle_connect_deauthorized,
    "invoice.paid": handle_invoice_paid,
    "invoice.payment_failed": handle_invoice_payment_failed,
    "invoice.finalized": handle_invoice_finalized,
    "customer.subscription.updated": handle_subscription_updated,
    "customer.subscription.deleted": handle_subscription_deleted,
    "transfer.created": handle_transfer_created,
    "transfer.failed": handle_transfer_failed,
    "payout.paid": handle_payout_paid,
    "payout.failed": handle_payout_failed,
    "charge.dispute.created": handle_dispute_created,
    "charge.dispute.closed": handle_dispute_closed,
    "invoice.upcoming": handle_invoice_upcoming,
}


async def handle_partner_webhook(
    db: AsyncSession,
    raw_body: bytes,
    signature_header: str,
    parsed_event: dict,
) -> dict:
    """
    Main entry point for partner webhook processing.

    1. Verify Stripe signature
    2. Check idempotency (skip duplicates)
    3. Route to appropriate handler
    4. Record event in idempotency table
    5. Return result (always 200 to Stripe)
    """
    # 1. Verify signature
    if not verify_partner_webhook_signature(raw_body, signature_header):
        logger.warning("partner.webhook.signature_invalid")
        return {"action": "signature_invalid", "status": 400}

    event_id = parsed_event.get("id", "")
    event_type = parsed_event.get("type", "")
    event_data = parsed_event.get("data", {})

    # Inject Connect account ID into event_data for handlers that need it
    connect_account = parsed_event.get("account")
    if connect_account:
        event_data["_connect_account_id"] = connect_account

    logger.info(
        "partner.webhook.received",
        event_id=event_id,
        event_type=event_type,
        connect_account=connect_account,
    )

    # 2. Idempotency check
    if event_id and await _check_idempotency(db, event_id):
        logger.info("partner.webhook.duplicate", event_id=event_id, event_type=event_type)
        return {"action": "duplicate", "event_id": event_id}

    # 3. Route to handler
    handler = EVENT_HANDLER_MAP.get(event_type)
    if not handler:
        logger.info("partner.webhook.unhandled_type", event_type=event_type)
        if event_id:
            await _record_event(db, event_id, event_type, handler_result="skipped")
            await db.commit()
        return {"action": "ignored", "event_type": event_type}

    # 4. Execute handler
    handler_result = "success"
    try:
        result = await handler(db, event_data)
        await db.commit()
    except Exception as e:
        handler_result = "failed"
        logger.error(
            "partner.webhook.handler_failed",
            event_id=event_id,
            event_type=event_type,
            error=str(e),
        )
        await db.rollback()
        result = {"action": "error", "event_type": event_type, "error": str(e)}

    # 5. Record event
    try:
        if event_id:
            await _record_event(
                db, event_id, event_type,
                handler_result=handler_result,
                metadata_={"result_action": result.get("action")},
            )
            await db.commit()
    except Exception:
        logger.debug("partner.webhook.idempotency_record_failed", event_id=event_id)

    return result
