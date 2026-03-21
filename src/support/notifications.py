"""
Support ticket notification + escalation logic.

Sends Telegram alerts on ticket creation with severity-prefixed messages
and SLA deadlines. Uses TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID from settings.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import TYPE_CHECKING

import httpx
import structlog

from config.settings import get_settings

if TYPE_CHECKING:
    from src.support.models import TicketResponse

logger = structlog.get_logger(__name__)

_SEVERITY_LABELS = {
    "p0": ("P0 CRITICAL", 4),
    "p1": ("P1 HIGH", 8),
    "p2": ("P2 MEDIUM", 24),
    "p3": ("P3 LOW", 72),
}

_SEVERITY_EMOJI = {
    "p0": "\U0001f6a8",   # rotating light
    "p1": "\u26a0\ufe0f",  # warning
    "p2": "\U0001f4cb",    # clipboard
    "p3": "\U0001f4dd",    # memo
}

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"


def _build_message(ticket: "TicketResponse", tenant_name: str) -> str:
    label, sla_hours = _SEVERITY_LABELS.get(ticket.severity, ("P2 MEDIUM", 24))
    emoji = _SEVERITY_EMOJI.get(ticket.severity, "\U0001f4cb")

    lines = [
        f"{emoji} <b>{label} \u2014 SLA {sla_hours}h</b>",
        "",
        f"<b>Ticket:</b> TIR-{ticket.ticket_id}",
        f"<b>Tenant:</b> {tenant_name}",
        f"<b>Subject:</b> {ticket.subject}",
        f"<b>Category:</b> {ticket.category}",
        "",
        "<b>Description:</b>",
        ticket.description[:800] + ("..." if len(ticket.description) > 800 else ""),
        "",
        f"<b>Deadline:</b> {ticket.sla_deadline}",
        f"<b>Acknowledge:</b> PUT /v1/support/tickets/{ticket.ticket_id}/acknowledge",
    ]
    return "\n".join(lines)


async def send_ticket_notification(ticket: "TicketResponse", tenant_name: str) -> None:
    """
    Fire a Telegram message for a newly created support ticket.
    Non-fatal — logs warning on failure but does not raise.
    """
    settings = get_settings()
    bot_token = settings.telegram_bot_token
    chat_id = settings.telegram_chat_id

    if not bot_token or not chat_id:
        logger.warning(
            "support.notification_skipped",
            reason="TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured",
            ticket_id=ticket.ticket_id,
        )
        return

    text = _build_message(ticket, tenant_name)
    url = TELEGRAM_API.format(token=bot_token)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                url,
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True,
                },
            )
            resp.raise_for_status()
        logger.info(
            "support.notification_sent",
            ticket_id=ticket.ticket_id,
            severity=ticket.severity,
        )
    except Exception as exc:
        logger.warning(
            "support.notification_failed",
            ticket_id=ticket.ticket_id,
            error=str(exc),
        )
