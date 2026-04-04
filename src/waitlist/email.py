"""
Waitlist confirmation email — sends branded Tiresias emails via Resend.
"""

import resend
import structlog

from config.settings import get_settings

logger = structlog.get_logger(__name__)

WAITLIST_CONFIRMATION_HTML = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:12px;border:1px solid #1f2937;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(212,168,83,0.2);">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#d4a853;letter-spacing:0.5px;">TIRESIAS</h1>
              <p style="margin:4px 0 0;font-size:13px;color:#6b7280;letter-spacing:1px;">SECURITY PLATFORM</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 16px;font-size:16px;color:#e5e7eb;">Hi {contact_name},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.6;">
                You're on the Tiresias waitlist for <strong style="color:#e5e7eb;">{company_name}</strong>.
                You're number <strong style="color:#d4a853;">#{position}</strong> in line.
              </p>
              <div style="background:#0a0e1a;border:1px solid #1f2937;border-radius:8px;padding:20px;margin-bottom:24px;">
                <p style="margin:0 0 14px;font-size:14px;font-weight:600;color:#d4a853;">What happens next?</p>
                <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">&#x2713; We review every application personally</p>
                <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">&#x2713; Beta invites go out in waves</p>
                <p style="margin:0;font-size:13px;color:#9ca3af;">&#x2713; You'll get full platform access when invited</p>
              </div>
              <p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.6;">
                When your spot opens, we'll send you everything you need to get started with
                SoulAuth, SoulWatch, and SoulGate.
              </p>
              <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
                Questions? Reply to this email or reach us at <a href="mailto:contact@tiresias.network" style="color:#2dd4bf;">contact@tiresias.network</a>.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #1f2937;background:#0d1117;">
              <p style="margin:0;font-size:12px;color:#4b5563;text-align:center;">
                Tiresias by Saluca Labs &mdash; Agent identity infrastructure for the AI era.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


async def send_waitlist_confirmation_email(
    contact_name: str,
    contact_email: str,
    company_name: str,
    position: int,
) -> bool:
    """Send waitlist confirmation email via Resend. Returns True on success."""
    settings = get_settings()

    if not settings.resend_api_key:
        logger.warning("waitlist.email_skipped", reason="RESEND_API_KEY not configured")
        return False

    resend.api_key = settings.resend_api_key

    html = WAITLIST_CONFIRMATION_HTML.format(
        contact_name=contact_name,
        company_name=company_name,
        position=position,
    )

    try:
        result = resend.Emails.send({
            "from": settings.trial_from_email,
            "to": [contact_email],
            "subject": f"You're on the Tiresias waitlist - {company_name}",
            "html": html,
        })
        logger.info(
            "waitlist.confirmation_email_sent",
            to=contact_email,
            resend_id=result.get("id") if isinstance(result, dict) else str(result),
        )
        return True
    except Exception as e:
        logger.error("waitlist.confirmation_email_failed", error=str(e), to=contact_email)
        return False
