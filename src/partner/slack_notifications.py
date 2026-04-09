"""
Dedicated Slack notification module for partner lifecycle events.

Posts rich Block Kit messages to the #partner-ops channel via incoming webhook.
All functions are non-fatal: delivery failures are logged but never re-raised,
so they do not block the caller.

The webhook URL is read from the ``PARTNER_OPS_SLACK_WEBHOOK`` environment
variable. When the variable is absent or empty, calls are silently skipped
at debug log level.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

import httpx
import structlog

logger = structlog.get_logger(__name__)

_SLACK_WEBHOOK_ENV = "PARTNER_OPS_SLACK_WEBHOOK"
_SLACK_BOT_TOKEN_ENV = "PARTNER_OPS_SLACK_BOT_TOKEN"
_SLACK_CHANNEL_ENV = "PARTNER_OPS_SLACK_CHANNEL"


# ---------------------------------------------------------------------------
# Core poster
# ---------------------------------------------------------------------------


async def post_partner_slack(
    event_type: str,
    blocks: list[dict],
    fallback_text: str,
) -> bool:
    """Post a Block Kit message to the partner-ops Slack webhook.

    Parameters
    ----------
    event_type:
        Machine-readable event name used in structured logs.
    blocks:
        Slack Block Kit block list.
    fallback_text:
        Plain-text summary shown in notifications and non-Block Kit clients.

    Returns ``True`` on successful delivery, ``False`` otherwise.
    Never raises.
    """
    webhook_url = os.getenv(_SLACK_WEBHOOK_ENV, "")
    bot_token = os.getenv(_SLACK_BOT_TOKEN_ENV, "")
    channel = os.getenv(_SLACK_CHANNEL_ENV, "")

    if not webhook_url and not (bot_token and channel):
        logger.debug(
            "partner.slack.skipped",
            reason="neither webhook nor bot token configured",
            event_type=event_type,
        )
        return False

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            if bot_token and channel:
                payload = {"channel": channel, "text": fallback_text, "blocks": blocks}
                resp = await client.post(
                    "https://slack.com/api/chat.postMessage",
                    json=payload,
                    headers={"Authorization": f"Bearer {bot_token}"},
                )
                resp.raise_for_status()
            else:
                payload = {"text": fallback_text, "blocks": blocks}
                resp = await client.post(webhook_url, json=payload)
                resp.raise_for_status()
        logger.info("partner.slack.sent", event_type=event_type)
        return True
    except Exception as exc:
        logger.error(
            "partner.slack.failed",
            event_type=event_type,
            error=str(exc),
        )
        return False


# ---------------------------------------------------------------------------
# Block Kit helpers
# ---------------------------------------------------------------------------


def _header_block(text: str) -> dict:
    return {"type": "header", "text": {"type": "plain_text", "text": text}}


def _fields_section(fields: list[tuple[str, str]]) -> dict:
    """Build a section block with mrkdwn field pairs."""
    return {
        "type": "section",
        "fields": [
            {"type": "mrkdwn", "text": f"*{label}:*\n{value}"}
            for label, value in fields
        ],
    }


def _context_block(text: str) -> dict:
    return {
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": text}],
    }


def _timestamp_context() -> dict:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return _context_block(ts)


def _divider() -> dict:
    return {"type": "divider"}


def _color_attachment(color: str, blocks: list[dict], fallback: str) -> dict:
    """Wrap blocks in an attachment to apply a sidebar colour.

    Slack Block Kit messages do not support colour natively; attachments
    with a ``color`` field are the canonical workaround.
    """
    return {"color": color, "blocks": blocks, "fallback": fallback}


# ---------------------------------------------------------------------------
# Event-specific notification builders
# ---------------------------------------------------------------------------


async def slack_partner_onboarded(
    partner_name: str,
    partner_type: str,
    commission_rate: float,
    referral_code: str,
) -> bool:
    """Notify #partner-ops that a new partner has completed onboarding."""
    rate_display = f"{commission_rate * 100:.1f}%"
    blocks = [
        _header_block("New Partner Onboarded"),
        _fields_section([
            ("Partner", partner_name),
            ("Type", partner_type),
            ("Commission Rate", rate_display),
            ("Referral Code", referral_code),
        ]),
        _timestamp_context(),
    ]
    fallback = f":handshake: New partner onboarded: {partner_name} ({partner_type})"
    return await post_partner_slack("partner_onboarded", blocks, fallback)


async def slack_partner_deactivated(
    partner_name: str,
    reason: str,
    admin_name: str,
) -> bool:
    """Notify #partner-ops that a partner has been deactivated.

    Renders with a warning (yellow) colour sidebar.
    """
    inner_blocks = [
        _header_block("Partner Deactivated"),
        _fields_section([
            ("Partner", partner_name),
            ("Reason", reason),
            ("Deactivated By", admin_name),
        ]),
        _timestamp_context(),
    ]
    fallback = f":warning: Partner deactivated: {partner_name}"
    # Use attachment wrapper for yellow sidebar
    webhook_url = os.getenv(_SLACK_WEBHOOK_ENV, "")
    if not webhook_url:
        logger.debug(
            "partner.slack.skipped",
            reason="webhook not configured",
            event_type="partner_deactivated",
        )
        return False

    payload = {
        "text": fallback,
        "attachments": [
            _color_attachment("#f59e0b", inner_blocks, fallback),
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(webhook_url, json=payload)
            resp.raise_for_status()
        logger.info("partner.slack.sent", event_type="partner_deactivated")
        return True
    except Exception as exc:
        logger.error(
            "partner.slack.failed",
            event_type="partner_deactivated",
            error=str(exc),
        )
        return False


async def slack_partner_reactivated(
    partner_name: str,
    admin_name: str,
) -> bool:
    """Notify #partner-ops that a partner has been reactivated."""
    blocks = [
        _header_block("Partner Reactivated"),
        _fields_section([
            ("Partner", partner_name),
            ("Reactivated By", admin_name),
        ]),
        _timestamp_context(),
    ]
    fallback = f":white_check_mark: Partner reactivated: {partner_name}"
    return await post_partner_slack("partner_reactivated", blocks, fallback)


async def slack_terms_updated(
    partner_name: str,
    changes: list[dict],
) -> bool:
    """Notify #partner-ops that partner terms have been updated.

    ``changes`` is a list of dicts, each with keys ``field``, ``old``, and
    ``new`` describing a single changed term.
    """
    change_lines = "\n".join(
        f"  {c.get('field', 'unknown')}: {c.get('old', 'N/A')} \u2192 {c.get('new', 'N/A')}"
        for c in changes
    )
    blocks = [
        _header_block("Partner Terms Updated"),
        _fields_section([("Partner", partner_name)]),
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Changes:*\n```{change_lines}```",
            },
        },
        _timestamp_context(),
    ]
    fallback = f":pencil: Partner terms updated: {partner_name}"
    return await post_partner_slack("terms_updated", blocks, fallback)


async def slack_payout_failed(
    partner_name: str,
    amount: float,
    reason: str,
) -> bool:
    """Notify #partner-ops that a partner payout has failed.

    Renders with a danger (red) colour sidebar.
    """
    amount_display = f"${amount:,.2f}"
    inner_blocks = [
        _header_block("Payout Failed"),
        _fields_section([
            ("Partner", partner_name),
            ("Amount", amount_display),
            ("Failure Reason", reason),
        ]),
        _timestamp_context(),
    ]
    fallback = f":rotating_light: Payout failed for {partner_name}: {amount_display}"
    # Use attachment wrapper for red sidebar
    webhook_url = os.getenv(_SLACK_WEBHOOK_ENV, "")
    if not webhook_url:
        logger.debug(
            "partner.slack.skipped",
            reason="webhook not configured",
            event_type="payout_failed",
        )
        return False

    payload = {
        "text": fallback,
        "attachments": [
            _color_attachment("#ef4444", inner_blocks, fallback),
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(webhook_url, json=payload)
            resp.raise_for_status()
        logger.info("partner.slack.sent", event_type="payout_failed")
        return True
    except Exception as exc:
        logger.error(
            "partner.slack.failed",
            event_type="payout_failed",
            error=str(exc),
        )
        return False


async def slack_high_value_referral(
    partner_name: str,
    customer_name: str,
    mrr: float,
) -> bool:
    """Notify #partner-ops of a high-value referral (MRR > $500).

    Callers should only invoke this when the MRR threshold is exceeded.
    As a safety net, this function also checks and returns ``False``
    without posting if ``mrr <= 500``.
    """
    if mrr <= 500:
        logger.debug(
            "partner.slack.high_value_referral.below_threshold",
            partner_name=partner_name,
            mrr=mrr,
        )
        return False

    mrr_display = f"${mrr:,.2f}"
    blocks = [
        _header_block("High-Value Referral"),
        _fields_section([
            ("Partner", partner_name),
            ("Customer", customer_name),
            ("MRR", mrr_display),
        ]),
        _timestamp_context(),
    ]
    fallback = f":star2: High-value referral from {partner_name}: {customer_name} at {mrr_display}/mo"
    return await post_partner_slack("high_value_referral", blocks, fallback)


async def slack_invitation_revoked(
    partner_name: str,
    admin_name: str,
    reason: str,
) -> bool:
    """Notify #partner-ops that a partner invitation has been revoked."""
    blocks = [
        _header_block("Invitation Revoked"),
        _fields_section([
            ("Partner", partner_name),
            ("Revoked By", admin_name),
            ("Reason", reason),
        ]),
        _timestamp_context(),
    ]
    fallback = f":x: Invitation revoked for {partner_name} by {admin_name}"
    return await post_partner_slack("invitation_revoked", blocks, fallback)
