"""
Trial verification email — sends branded Tiresias emails via Resend.
"""

import resend
import structlog

from config.settings import get_settings

logger = structlog.get_logger(__name__)

VERIFICATION_EMAIL_HTML = """
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
                Your Tiresias platform trial for <strong style="color:#e5e7eb;">{company_name}</strong> is ready.
                Verify your email to activate 14 days of full access to SoulAuth, SoulWatch, and SoulGate.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="background:#d4a853;border-radius:8px;padding:14px 32px;">
                    <a href="{verify_url}" style="color:#0a0e1a;text-decoration:none;font-size:15px;font-weight:600;display:block;">
                      Verify &amp; Activate Trial
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:13px;color:#6b7280;text-align:center;">
                Or copy this link: <br>
                <span style="color:#2dd4bf;word-break:break-all;">{verify_url}</span>
              </p>
              <!-- What you'll get -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a;border-radius:8px;border:1px solid rgba(45,212,191,0.3);padding:20px;margin-bottom:16px;">
                <tr>
                  <td>
                    <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#2dd4bf;">After verifying, you'll receive:</p>
                    <p style="margin:0 0 4px;font-size:13px;color:#e5e7eb;">&#x2713; Your Tiresias API keys (shown once &mdash; save them!)</p>
                    <p style="margin:0 0 4px;font-size:13px;color:#e5e7eb;">&#x2713; Docker Compose deployment files (pre-configured)</p>
                    <p style="margin:0;font-size:13px;color:#e5e7eb;">&#x2713; Your license key (14-day trial)</p>
                  </td>
                </tr>
              </table>
              <!-- Deploy quickstart -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a;border-radius:8px;border:1px solid #1f2937;padding:20px;margin-bottom:16px;">
                <tr>
                  <td>
                    <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#d4a853;">Deploy in 60 seconds:</p>
                    <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;">1. Download the files from the verification page</p>
                    <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;">2. <span style="font-family:'Courier New',monospace;color:#2dd4bf;">docker compose up -d</span></p>
                    <p style="margin:0;font-size:13px;color:#9ca3af;">3. Point your AI agents at <span style="font-family:'Courier New',monospace;color:#2dd4bf;">http://localhost:8080/v1</span></p>
                  </td>
                </tr>
              </table>
              <!-- What's included -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a;border-radius:8px;border:1px solid #1f2937;padding:20px;margin-bottom:24px;">
                <tr>
                  <td>
                    <p style="margin:0 0 14px;font-size:14px;font-weight:600;color:#d4a853;">Your 14-day trial includes the full platform:</p>
                    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#d4a853;">SoulAuth - Identity &amp; Auth</p>
                    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">&#x2713; Agent identities, capability tokens, policy engine</p>
                    <p style="margin:0 0 10px;font-size:12px;color:#9ca3af;">&#x2713; Key lifecycle, delegation, Python SDK &amp; CLI</p>
                    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#2dd4bf;">SoulWatch - Runtime Monitoring</p>
                    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">&#x2713; Anomaly detection, Sigma rules, agent risk scoring</p>
                    <p style="margin:0 0 10px;font-size:12px;color:#9ca3af;">&#x2713; Compliance reports, SIEM forwarding, quarantine</p>
                    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#f59e0b;">SoulGate - API Gateway</p>
                    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">&#x2713; Rate limiting, prompt injection detection</p>
                    <p style="margin:0;font-size:12px;color:#9ca3af;">&#x2713; Circuit breakers, access controls, audit logging</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
                This link expires in 48 hours. If you didn't request this trial, you can safely ignore this email.
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


async def send_verification_email(
    contact_name: str,
    contact_email: str,
    company_name: str,
    trial_id: str,
    verification_token: str,
) -> bool:
    """Send trial verification email via Resend. Returns True on success."""
    settings = get_settings()

    if not settings.resend_api_key:
        logger.warning("trial.email_skipped", reason="RESEND_API_KEY not configured")
        return False

    resend.api_key = settings.resend_api_key

    verify_url = (
        f"{settings.trial_verify_base_url}"
        f"?trial_id={trial_id}&token={verification_token}"
    )

    html = VERIFICATION_EMAIL_HTML.format(
        contact_name=contact_name,
        company_name=company_name,
        verify_url=verify_url,
    )

    try:
        result = resend.Emails.send({
            "from": settings.trial_from_email,
            "to": [contact_email],
            "subject": f"Verify your SoulAuth trial - {company_name}",
            "html": html,
        })
        logger.info(
            "trial.verification_email_sent",
            to=contact_email,
            resend_id=result.get("id") if isinstance(result, dict) else str(result),
        )
        return True
    except Exception as e:
        logger.error("trial.verification_email_failed", error=str(e), to=contact_email)
        return False
