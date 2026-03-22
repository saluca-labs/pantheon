"""
Chatbot escalation -- auto-creates support ticket and fires Telegram notification
when bot confidence is low or user explicitly requests human help.

Reuses src/support/linear.create_linear_issue() and
src/support/notifications.send_ticket_notification().
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)

# Phrases that trigger human escalation regardless of confidence
_ESCALATION_PHRASES = [
    r"talk to a human",
    r"speak to (?:a )?(?:human|person|agent|support)",
    r"escalate",
    r"real person",
    r"live agent",
    r"open.*ticket",
    r"create.*ticket",
    r"need help",
]

CONFIDENCE_THRESHOLD = 0.4  # below this, auto-escalate


def should_escalate(message: str, confidence: float) -> bool:
    """Return True if this conversation should be escalated to human support."""
    if confidence < CONFIDENCE_THRESHOLD:
        return True
    lower = message.lower()
    for pattern in _ESCALATION_PHRASES:
        if re.search(pattern, lower):
            return True
    return False


async def escalate(
    tenant_id: Optional[str],
    session_id: str,
    user_message: str,
    chat_transcript: str,
    confidence: float,
) -> Optional[str]:
    """
    Create a Linear issue and send Telegram notification.
    Returns the Linear issue URL if successful, None on failure.
    """
    from src.support.models import TicketResponse, sla_deadline_for  # type: ignore[import]
    from src.support.linear import create_linear_issue  # type: ignore[import]
    from src.support.notifications import send_ticket_notification  # type: ignore[import]

    ticket_id = uuid.uuid4().hex[:8].upper()
    now = datetime.now(timezone.utc)
    sla = sla_deadline_for("p2", now)  # sla_deadline_for(severity, created_at) -> str

    subject = f"Chat Escalation: {user_message[:80]}"
    description = (
        f"Chat session escalated to human support.\n\n"
        f"Session ID: {session_id}\n"
        f"Tenant ID: {tenant_id or 'unknown'}\n"
        f"Bot confidence: {confidence:.2f}\n"
        f"Last message: {user_message[:200]}\n\n"
        f"--- Chat Transcript ---\n{chat_transcript[:2000]}"
    )

    # TicketResponse.created_at is str (ISO format)
    ticket = TicketResponse(
        ticket_id=ticket_id,
        status="open",
        severity="p2",
        category="question",
        subject=subject,
        description=description,
        tenant_id=tenant_id,
        created_at=now.isoformat(),
        acknowledged_at=None,
        resolved_at=None,
        sla_deadline=sla,
    )

    tenant_name = tenant_id or "Unknown"

    try:
        linear_url = await create_linear_issue(ticket, tenant_name)
        await send_ticket_notification(ticket, tenant_name, linear_url)
        logger.info(
            "chatbot.escalated",
            session_id=session_id,
            ticket_id=ticket_id,
            linear_url=linear_url,
            confidence=confidence,
        )
        return linear_url
    except Exception as exc:
        logger.error("chatbot.escalation_failed", session_id=session_id, error=str(exc))
        return None
