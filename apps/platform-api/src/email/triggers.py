"""
Lifecycle email trigger functions.

Each function is non-fatal: email delivery failure is logged but never re-raised.
Call these from registration, trial cron, Stripe webhook, and support routes.
"""

from __future__ import annotations

import structlog

from src.email.sender import send_email
from src.email.templates import (
    render_welcome,
    render_trial_expiring,
    render_trial_expired,
    render_payment_receipt,
    render_p0_acknowledged,
)

logger = structlog.get_logger(__name__)


async def on_registration(
    *,
    contact_name: str,
    contact_email: str,
    soulkey: str,
) -> None:
    """EMAIL-01: Welcome email fired immediately after registration."""
    try:
        html = render_welcome(contact_name=contact_name, soulkey=soulkey)
        await send_email(
            to=contact_email,
            subject="Welcome to Tiresias — your soulkey is ready",
            html=html,
            tag="welcome",
        )
    except Exception as exc:
        logger.error("email.trigger.on_registration.error", to=contact_email, error=str(exc))


async def on_trial_expiring(
    *,
    contact_name: str,
    contact_email: str,
    days_remaining: int,
    agents_used: int = 0,
    requests_used: int = 0,
) -> None:
    """EMAIL-02: Trial-expiring warning. Call from trial expiry cron on day 10."""
    try:
        html = render_trial_expiring(
            contact_name=contact_name,
            days_remaining=days_remaining,
            agents_used=agents_used,
            requests_used=requests_used,
        )
        plural = "s" if days_remaining != 1 else ""
        await send_email(
            to=contact_email,
            subject=f"Your Tiresias trial expires in {days_remaining} day{plural}",
            html=html,
            tag="trial_expiring",
        )
    except Exception as exc:
        logger.error("email.trigger.on_trial_expiring.error", to=contact_email, error=str(exc))


async def on_trial_expired(
    *,
    contact_name: str,
    contact_email: str,
    data_retention_days: int = 30,
) -> None:
    """EMAIL-03: Trial-expired notice. Call from trial expiry cron at day 14."""
    try:
        html = render_trial_expired(
            contact_name=contact_name,
            data_retention_days=data_retention_days,
        )
        await send_email(
            to=contact_email,
            subject="Your Tiresias trial has ended",
            html=html,
            tag="trial_expired",
        )
    except Exception as exc:
        logger.error("email.trigger.on_trial_expired.error", to=contact_email, error=str(exc))


async def on_payment_received(
    *,
    contact_name: str,
    contact_email: str,
    amount_cents: int,
    currency: str = "usd",
    invoice_id: str,
    invoice_url: str,
    billing_reason: str = "subscription",
    tier: str = "Pro",
) -> None:
    """EMAIL-04: Payment receipt. Call from Stripe invoice.paid webhook."""
    try:
        symbol = "$" if currency.lower() == "usd" else currency.upper() + " "
        amount_formatted = f"{symbol}{amount_cents / 100:.2f}"
        html = render_payment_receipt(
            contact_name=contact_name,
            amount_formatted=amount_formatted,
            invoice_id=invoice_id,
            invoice_url=invoice_url,
            billing_reason=billing_reason,
            tier=tier,
        )
        await send_email(
            to=contact_email,
            subject=f"Payment received — {amount_formatted} Tiresias {tier}",
            html=html,
            tag="payment_receipt",
        )
    except Exception as exc:
        logger.error("email.trigger.on_payment_received.error", to=contact_email, error=str(exc))


async def on_p0_acknowledged(
    *,
    contact_name: str,
    contact_email: str,
    ticket_id: str,
    subject: str,
    sla_hours: int = 4,
) -> None:
    """EMAIL-05: P0 acknowledgment. Call from support router acknowledge_ticket."""
    try:
        html = render_p0_acknowledged(
            contact_name=contact_name,
            ticket_id=ticket_id,
            subject=subject,
            sla_hours=sla_hours,
        )
        await send_email(
            to=contact_email,
            subject=f"[{ticket_id}] P0 Acknowledged — Tiresias Support",
            html=html,
            tag="p0_acknowledged",
        )
    except Exception as exc:
        logger.error("email.trigger.on_p0_acknowledged.error", to=contact_email, error=str(exc))
