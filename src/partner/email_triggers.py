"""
Partner email trigger functions.

Thin async wrappers that compose template rendering + email sending for each
partner lifecycle event. Each function is non-fatal: delivery failures are
logged via structlog but never re-raised, so they never block the caller.

Call these from route handlers, cron jobs, and webhook handlers.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulPartner
from src.email.sender import send_email
from src.partner.email_templates import (
    render_partner_invitation,
    render_partner_welcome,
    render_connect_setup_reminder,
    render_partner_deactivated,
    render_partner_terms_updated,
    render_monthly_commission_report,
    render_payout_processed,
    render_payout_failed,
)

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-01: Partner Invitation
# ---------------------------------------------------------------------------


async def trigger_partner_invitation(
    email: str,
    partner_name: str,
    onboarding_url: str,
    expires_in_days: int = 30,
) -> None:
    """Send partner invitation email after admin approves an application."""
    try:
        subject, html = render_partner_invitation(
            partner_name=partner_name,
            onboarding_url=onboarding_url,
            expires_in_days=expires_in_days,
        )
        await send_email(
            to=email,
            subject=subject,
            html=html,
            tag="partner_invitation",
        )
        logger.info(
            "partner.trigger.invitation.sent",
            to=email,
            partner_name=partner_name,
        )
    except Exception as exc:
        logger.error(
            "partner.trigger.invitation.error",
            to=email,
            partner_name=partner_name,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-02: Welcome / Onboarding Complete
# ---------------------------------------------------------------------------


async def trigger_partner_welcome(
    email: str,
    partner_name: str,
    partner_type: str,
    commission_rate: float,
    dashboard_url: str,
) -> None:
    """Send welcome email after partner completes onboarding."""
    try:
        subject, html = render_partner_welcome(
            partner_name=partner_name,
            partner_type=partner_type,
            commission_rate=commission_rate,
            dashboard_url=dashboard_url,
        )
        await send_email(
            to=email,
            subject=subject,
            html=html,
            tag="partner_welcome",
        )
        logger.info(
            "partner.trigger.welcome.sent",
            to=email,
            partner_name=partner_name,
            partner_type=partner_type,
        )
    except Exception as exc:
        logger.error(
            "partner.trigger.welcome.error",
            to=email,
            partner_name=partner_name,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-03: Stripe Connect Setup Reminder
# ---------------------------------------------------------------------------


async def trigger_connect_reminder(
    email: str,
    partner_name: str,
    onboarding_url: str,
) -> None:
    """Send Stripe Connect setup reminder (48h after onboarding, no Connect)."""
    try:
        subject, html = render_connect_setup_reminder(
            partner_name=partner_name,
            onboarding_url=onboarding_url,
        )
        await send_email(
            to=email,
            subject=subject,
            html=html,
            tag="partner_stripe_reminder",
        )
        logger.info(
            "partner.trigger.connect_reminder.sent",
            to=email,
            partner_name=partner_name,
        )
    except Exception as exc:
        logger.error(
            "partner.trigger.connect_reminder.error",
            to=email,
            partner_name=partner_name,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-04: Partner Deactivation Notice
# ---------------------------------------------------------------------------


async def trigger_partner_deactivated(
    email: str,
    partner_name: str,
    reason: str,
) -> None:
    """Send deactivation notice when admin suspends a partner."""
    try:
        subject, html = render_partner_deactivated(
            partner_name=partner_name,
            reason=reason,
        )
        await send_email(
            to=email,
            subject=subject,
            html=html,
            tag="partner_deactivated",
        )
        logger.info(
            "partner.trigger.deactivated.sent",
            to=email,
            partner_name=partner_name,
        )
    except Exception as exc:
        logger.error(
            "partner.trigger.deactivated.error",
            to=email,
            partner_name=partner_name,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-05: Terms Updated Notice
# ---------------------------------------------------------------------------


async def trigger_partner_terms_updated(
    email: str,
    partner_name: str,
    changes: list[dict],
) -> None:
    """Send terms-updated notice when admin modifies partner revshare config."""
    try:
        subject, html = render_partner_terms_updated(
            partner_name=partner_name,
            changes=changes,
        )
        await send_email(
            to=email,
            subject=subject,
            html=html,
            tag="partner_terms_updated",
        )
        logger.info(
            "partner.trigger.terms_updated.sent",
            to=email,
            partner_name=partner_name,
        )
    except Exception as exc:
        logger.error(
            "partner.trigger.terms_updated.error",
            to=email,
            partner_name=partner_name,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-06: Monthly Commission Report
# ---------------------------------------------------------------------------


async def trigger_monthly_report(
    email: str,
    partner_name: str,
    month: str,
    referral_count: int,
    mrr_attributed: float,
    commission_earned: float,
    payout_amount: float,
    dashboard_url: str,
) -> None:
    """Send monthly commission report after reconciliation cron completes."""
    try:
        subject, html = render_monthly_commission_report(
            partner_name=partner_name,
            month=month,
            referral_count=referral_count,
            mrr_attributed=mrr_attributed,
            commission_earned=commission_earned,
            payout_amount=payout_amount,
            dashboard_url=dashboard_url,
        )
        await send_email(
            to=email,
            subject=subject,
            html=html,
            tag="partner_monthly_report",
        )
        logger.info(
            "partner.trigger.monthly_report.sent",
            to=email,
            partner_name=partner_name,
            month=month,
        )
    except Exception as exc:
        logger.error(
            "partner.trigger.monthly_report.error",
            to=email,
            partner_name=partner_name,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-07: Payout Processed
# ---------------------------------------------------------------------------


async def trigger_payout_processed(
    email: str,
    partner_name: str,
    amount: float,
    period: str,
    transfer_id: str,
) -> None:
    """Send payout confirmation when Stripe Transfer succeeds."""
    try:
        subject, html = render_payout_processed(
            partner_name=partner_name,
            amount=amount,
            period=period,
            transfer_id=transfer_id,
        )
        await send_email(
            to=email,
            subject=subject,
            html=html,
            tag="partner_payout_processed",
        )
        logger.info(
            "partner.trigger.payout_processed.sent",
            to=email,
            partner_name=partner_name,
            amount=amount,
            transfer_id=transfer_id,
        )
    except Exception as exc:
        logger.error(
            "partner.trigger.payout_processed.error",
            to=email,
            partner_name=partner_name,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-08: Payout Failed
# ---------------------------------------------------------------------------


async def trigger_payout_failed(
    email: str,
    partner_name: str,
    amount: float,
    reason: str,
    dashboard_url: str,
) -> None:
    """Send payout failure notice to partner AND admin (partners@saluca.com).

    Both sends are awaited independently via asyncio.gather so a failure on
    one does not block the other.
    """
    admin_email = "partners@saluca.com"

    try:
        subject, partner_html = render_payout_failed(
            partner_name=partner_name,
            amount=amount,
            reason=reason,
            dashboard_url=dashboard_url,
        )
        results = await asyncio.gather(
            send_email(
                to=email,
                subject=subject,
                html=partner_html,
                tag="partner_payout_failed",
            ),
            send_email(
                to=admin_email,
                subject=f"[ADMIN] Payout failed for partner {partner_name}",
                html=partner_html,
                tag="partner_payout_failed_admin",
            ),
            return_exceptions=True,
        )
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                target = email if i == 0 else admin_email
                logger.error(
                    "partner.trigger.payout_failed.partial_error",
                    to=target,
                    partner_name=partner_name,
                    error=str(result),
                )
            else:
                target = email if i == 0 else admin_email
                logger.info(
                    "partner.trigger.payout_failed.sent",
                    to=target,
                    partner_name=partner_name,
                )
    except Exception as exc:
        logger.error(
            "partner.trigger.payout_failed.error",
            to=email,
            partner_name=partner_name,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# Convenience: Cron-callable Connect Reminder
# ---------------------------------------------------------------------------


async def trigger_connect_reminder_if_needed(
    partner: SoulPartner,
    db: AsyncSession,
) -> None:
    """Send Stripe Connect reminder if the partner was onboarded >48h ago and
    has not yet completed Stripe Connect setup.

    Intended to be called from a daily cron job. The function checks:
      1. ``partner.approved_at`` is more than 48 hours ago.
      2. Stripe Connect is not set up (``stripe_connect_account_id`` is None
         or ``stripe_connect_status`` is not ``"active"``).

    If both conditions are met, fires ``trigger_connect_reminder``.
    """
    if partner.approved_at is None:
        return

    now = datetime.now(timezone.utc)
    approved_at = partner.approved_at
    if approved_at.tzinfo is None:
        approved_at = approved_at.replace(tzinfo=timezone.utc)

    hours_since_approval = (now - approved_at).total_seconds() / 3600
    if hours_since_approval < 48:
        return

    if partner.stripe_connect_account_id is not None and partner.stripe_connect_status == "active":
        return

    onboarding_url = "https://tiresias.network/partners/connect/setup"

    logger.info(
        "partner.trigger.connect_reminder.check_passed",
        partner_id=str(partner.id),
        partner_name=partner.name,
        hours_since_approval=round(hours_since_approval, 1),
    )

    await trigger_connect_reminder(
        email=partner.contact_email,
        partner_name=partner.name,
        onboarding_url=onboarding_url,
    )
