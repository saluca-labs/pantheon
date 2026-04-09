"""
Partner admin notification hooks.

Email notifications use the existing Resend-based sender (src/email/sender.py)
and follow the Tiresias branded HTML template pattern (src/email/templates.py).
Slack notifications POST to the #partner-ops incoming webhook.

All functions are non-fatal: delivery failures are logged but never re-raised,
so they do not block the API response.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
import structlog

from config.settings import get_settings
from src.database.models import SoulPartner
from src.email.sender import send_email
from src.email.templates import _HEADER, _FOOTER, _cta_button, _kv_row

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------

_DASHBOARD_URL = "https://tiresias.network/partner/dashboard"
_SUPPORT_EMAIL_FALLBACK = "support@tiresias.network"

# ---------------------------------------------------------------------------
# Email template renderers (partner lifecycle)
# ---------------------------------------------------------------------------


def _render_partner_deactivated(
    *,
    partner_name: str,
    reason: str,
    support_email: str,
) -> str:
    """Render deactivation notice HTML."""
    body = (
        f'\n<p style="margin:0 0 16px;font-size:16px;color:#e5e7eb;">Hi {partner_name},</p>\n'
        f'<p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.6;">\n'
        f'  Your Tiresias partner account has been <strong style="color:#f59e0b;">suspended</strong>.\n'
        f'</p>\n'
        f'<!-- Reason box -->\n'
        f'<table width="100%" cellpadding="0" cellspacing="0"\n'
        f'       style="background:#0a0e1a;border-radius:8px;border:1px solid rgba(245,158,11,0.3);margin-bottom:24px;">\n'
        f'  <tr>\n'
        f'    <td style="padding:16px 20px;">\n'
        f'      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#f59e0b;">Reason</p>\n'
        f'      <p style="margin:0;font-size:13px;color:#e5e7eb;line-height:1.5;">{reason}</p>\n'
        f'    </td>\n'
        f'  </tr>\n'
        f'</table>\n'
        f'<p style="margin:0 0 16px;font-size:14px;color:#9ca3af;line-height:1.6;">\n'
        f'  Your existing referred tenants are <strong style="color:#e5e7eb;">not affected</strong>.\n'
        f'  However, new referrals and future payouts have been frozen while this suspension is in effect.\n'
        f'</p>\n'
        f'<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">\n'
        f'  If you believe this is an error or wish to appeal, contact\n'
        f'  <a href="mailto:{support_email}" style="color:#2dd4bf;">{support_email}</a>.\n'
        f'</p>'
    )
    return _HEADER + body + _FOOTER


def _render_partner_reactivated(
    *,
    partner_name: str,
    dashboard_url: str,
) -> str:
    """Render reactivation notice HTML."""
    body = (
        f'\n<p style="margin:0 0 16px;font-size:16px;color:#e5e7eb;">Hi {partner_name},</p>\n'
        f'<p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.6;">\n'
        f'  Great news! Your Tiresias partner account has been\n'
        f'  <strong style="color:#2dd4bf;">reactivated</strong>.\n'
        f'  Referral tracking and payouts are now fully operational again.\n'
        f'</p>\n'
        + _cta_button(dashboard_url, "Go to Partner Dashboard")
        + f'\n<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">\n'
        f'  Welcome back. If you have questions, reply to this email or contact support.\n'
        f'</p>'
    )
    return _HEADER + body + _FOOTER


def _render_partner_terms_updated(
    *,
    partner_name: str,
    changes: dict[str, dict[str, Any]],
    support_email: str,
) -> str:
    """Render terms-updated notice HTML with old/new value table."""
    rows = ""
    _labels = {
        "commission_rate": "Commission Rate",
        "override_commission_rate": "Override Commission Rate",
        "payout_frequency": "Payout Frequency",
    }
    for field, vals in changes.items():
        label = _labels.get(field, field.replace("_", " ").title())
        old_val = vals.get("old", "N/A")
        new_val = vals.get("new", "N/A")
        # Format rates as percentages
        if "rate" in field:
            try:
                old_val = f"{float(old_val) * 100:.1f}%"
                new_val = f"{float(new_val) * 100:.1f}%"
            except (ValueError, TypeError):
                pass
        rows += _kv_row(label, f"{old_val} &rarr; {new_val}")

    body = (
        f'\n<p style="margin:0 0 16px;font-size:16px;color:#e5e7eb;">Hi {partner_name},</p>\n'
        f'<p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.6;">\n'
        f'  Your Tiresias partner terms have been updated. The changes are effective immediately.\n'
        f'</p>\n'
        f'<!-- Changes table -->\n'
        f'<table width="100%" cellpadding="0" cellspacing="0"\n'
        f'       style="background:#0a0e1a;border-radius:8px;border:1px solid #1f2937;margin-bottom:24px;">\n'
        f'  <tr>\n'
        f'    <td style="padding:16px 20px;">\n'
        f'      <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#d4a853;">Updated Terms</p>\n'
        f'      <table width="100%" cellpadding="0" cellspacing="0">\n'
        + rows
        + f'\n      </table>\n'
        f'    </td>\n'
        f'  </tr>\n'
        f'</table>\n'
        f'<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">\n'
        f'  If you have questions about these changes, contact\n'
        f'  <a href="mailto:{support_email}" style="color:#2dd4bf;">{support_email}</a>.\n'
        f'</p>'
    )
    return _HEADER + body + _FOOTER


def _render_partner_invitation(
    *,
    partner_name: str,
    onboarding_url: str,
    expires_at: str,
) -> str:
    """Render partner invitation email HTML."""
    body = (
        f'\n<p style="margin:0 0 16px;font-size:16px;color:#e5e7eb;">Hi {partner_name},</p>\n'
        f'<p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.6;">\n'
        f'  You have been invited to join the <strong style="color:#d4a853;">Tiresias Partner Program</strong>.\n'
        f'  Click the button below to complete your onboarding.\n'
        f'</p>\n'
        + _cta_button(onboarding_url, "Accept Invitation")
        + f'\n<!-- Details -->\n'
        f'<table width="100%" cellpadding="0" cellspacing="0"\n'
        f'       style="background:#0a0e1a;border-radius:8px;border:1px solid #1f2937;margin-bottom:24px;">\n'
        f'  <tr>\n'
        f'    <td style="padding:16px 20px;">\n'
        f'      <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#d4a853;">What happens next?</p>\n'
        f'      <table width="100%" cellpadding="0" cellspacing="0">\n'
        + _kv_row("Step 1", "Complete the onboarding form")
        + _kv_row("Step 2", "Connect your Stripe account for payouts")
        + _kv_row("Step 3", "Access your partner dashboard")
        + f'\n      </table>\n'
        f'    </td>\n'
        f'  </tr>\n'
        f'</table>\n'
        f'<p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">\n'
        f'  This invitation expires on <strong style="color:#e5e7eb;">{expires_at}</strong>.\n'
        f'</p>\n'
        f'<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">\n'
        f'  If you did not expect this invitation, you can safely ignore this email.\n'
        f'</p>'
    )
    return _HEADER + body + _FOOTER


# ---------------------------------------------------------------------------
# Email notification functions
# ---------------------------------------------------------------------------


async def notify_partner_deactivated(
    partner: SoulPartner,
    reason: str,
) -> None:
    """Send deactivation notice to partner contact email.

    Non-fatal: logs and swallows exceptions.
    """
    try:
        settings = get_settings()
        support_email = getattr(settings, "support_email", _SUPPORT_EMAIL_FALLBACK)
        html = _render_partner_deactivated(
            partner_name=partner.name,
            reason=reason,
            support_email=support_email,
        )
        await send_email(
            to=partner.contact_email,
            subject="Tiresias Partner Account Suspended",
            html=html,
            tag="partner_deactivated",
        )
        logger.info(
            "partner.notify.deactivated.sent",
            partner_id=str(partner.id),
            to=partner.contact_email,
        )
    except Exception as exc:
        logger.error(
            "partner.notify.deactivated.error",
            partner_id=str(partner.id),
            to=partner.contact_email,
            error=str(exc),
        )


async def notify_partner_reactivated(
    partner: SoulPartner,
) -> None:
    """Send reactivation notice to partner contact email.

    Non-fatal: logs and swallows exceptions.
    """
    try:
        html = _render_partner_reactivated(
            partner_name=partner.name,
            dashboard_url=_DASHBOARD_URL,
        )
        await send_email(
            to=partner.contact_email,
            subject="Tiresias Partner Account Reactivated",
            html=html,
            tag="partner_reactivated",
        )
        logger.info(
            "partner.notify.reactivated.sent",
            partner_id=str(partner.id),
            to=partner.contact_email,
        )
    except Exception as exc:
        logger.error(
            "partner.notify.reactivated.error",
            partner_id=str(partner.id),
            to=partner.contact_email,
            error=str(exc),
        )


async def notify_partner_terms_updated(
    partner: SoulPartner,
    changes: dict[str, dict[str, Any]],
) -> None:
    """Send terms-updated notice with old/new values to partner contact email.

    ``changes`` should be a dict of ``{field_name: {"old": ..., "new": ...}}``.

    Non-fatal: logs and swallows exceptions.
    """
    try:
        settings = get_settings()
        support_email = getattr(settings, "support_email", _SUPPORT_EMAIL_FALLBACK)
        html = _render_partner_terms_updated(
            partner_name=partner.name,
            changes=changes,
            support_email=support_email,
        )
        await send_email(
            to=partner.contact_email,
            subject="Tiresias Partner Terms Updated",
            html=html,
            tag="partner_terms_updated",
        )
        logger.info(
            "partner.notify.terms_updated.sent",
            partner_id=str(partner.id),
            to=partner.contact_email,
        )
    except Exception as exc:
        logger.error(
            "partner.notify.terms_updated.error",
            partner_id=str(partner.id),
            to=partner.contact_email,
            error=str(exc),
        )


async def notify_partner_invitation_sent(
    email: str,
    partner_name: str,
    onboarding_url: str,
    expires_at: str | None = None,
) -> None:
    """Send partner invitation email to the prospective partner.

    Non-fatal: logs and swallows exceptions.
    """
    try:
        html = _render_partner_invitation(
            partner_name=partner_name,
            onboarding_url=onboarding_url,
            expires_at=expires_at or "30 days from now",
        )
        await send_email(
            to=email,
            subject="You're Invited to the Tiresias Partner Program",
            html=html,
            tag="partner_invitation",
        )
        logger.info(
            "partner.notify.invitation.sent",
            to=email,
            partner_name=partner_name,
        )
    except Exception as exc:
        logger.error(
            "partner.notify.invitation.error",
            to=email,
            partner_name=partner_name,
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# Slack notification
# ---------------------------------------------------------------------------

_SLACK_WEBHOOK_ENV = "PARTNER_OPS_SLACK_WEBHOOK"


async def notify_slack_partner_event(
    event_type: str,
    partner_name: str,
    detail: str,
) -> None:
    """Post a notification to the #partner-ops Slack channel via incoming webhook.

    Supported ``event_type`` values:
      partner_onboarded, partner_deactivated, partner_reactivated,
      terms_updated, invitation_revoked, payout_failed, high_value_referral

    If the webhook URL is not configured (env var ``PARTNER_OPS_SLACK_WEBHOOK``
    is unset), the call is silently skipped after a debug log. Delivery failures
    are logged but never re-raised so they do not block the API response.
    """
    webhook_url = os.getenv(_SLACK_WEBHOOK_ENV)
    if not webhook_url:
        logger.debug(
            "partner_ops.slack_skipped",
            reason="webhook not configured",
            event_type=event_type,
        )
        return

    _emoji_map = {
        "partner_applied": ":inbox_tray:",
        "partner_onboarded": ":tada:",
        "partner_deactivated": ":no_entry:",
        "partner_reactivated": ":white_check_mark:",
        "terms_updated": ":pencil:",
        "invitation_revoked": ":x:",
        "payout_failed": ":warning:",
        "high_value_referral": ":moneybag:",
    }
    emoji = _emoji_map.get(event_type, ":loudspeaker:")
    message = f"{emoji} [Partner Ops] *{partner_name}* | {event_type.replace('_', ' ')} | {detail}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(webhook_url, json={"text": message})
            resp.raise_for_status()
        logger.info(
            "partner_ops.slack_sent",
            event_type=event_type,
            partner_name=partner_name,
        )
    except Exception as exc:
        logger.warning(
            "partner_ops.slack_failed",
            event_type=event_type,
            partner_name=partner_name,
            error=str(exc),
        )
