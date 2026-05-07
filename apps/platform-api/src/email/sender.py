"""
Email sender — Resend wrapper for all Tiresias lifecycle emails.
"""
import resend
import structlog

from config.settings import get_settings

logger = structlog.get_logger(__name__)


async def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    tag: str = "lifecycle",
) -> bool:
    """
    Send a single email via Resend. Returns True on success, False on failure.
    Logs success (email.sent) and failure (email.failed) with structlog.
    tag is used for logging context only (e.g. "welcome", "trial_expiring").
    """
    settings = get_settings()

    if not settings.resend_api_key:
        logger.warning("email.skipped", tag=tag, reason="RESEND_API_KEY not configured")
        return False

    resend.api_key = settings.resend_api_key

    try:
        result = resend.Emails.send({
            "from": settings.trial_from_email,
            "to": [to],
            "subject": subject,
            "html": html,
        })
        resend_id = result.get("id") if isinstance(result, dict) else str(result)
        logger.info("email.sent", tag=tag, to=to, resend_id=resend_id)
        return True
    except Exception as exc:
        logger.error("email.failed", tag=tag, to=to, error=str(exc))
        return False
