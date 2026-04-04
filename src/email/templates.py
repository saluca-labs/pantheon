"""
Tiresias lifecycle email HTML templates.
Each render_* function returns a complete HTML email string.
All templates use table-based inline-style layout (email-client safe).
Brand: bg #0a0e1a, card #111827, gold #d4a853, teal #2dd4bf.
"""

from __future__ import annotations


# ---------------------------------------------------------------------------
# Shared layout helpers
# ---------------------------------------------------------------------------

_HEADER = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0"
           style="background:#111827;border-radius:12px;border:1px solid #1f2937;overflow:hidden;">
      <tr>
        <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(212,168,83,0.2);">
          <h1 style="margin:0;font-size:24px;font-weight:700;color:#d4a853;letter-spacing:0.5px;">TIRESIAS</h1>
          <p style="margin:4px 0 0;font-size:13px;color:#6b7280;letter-spacing:1px;">SECURITY PLATFORM</p>
        </td>
      </tr>
      <tr><td style="padding:32px 40px;">"""

_FOOTER = """      </td></tr>
      <tr>
        <td style="padding:20px 40px;border-top:1px solid #1f2937;background:#0d1117;">
          <p style="margin:0;font-size:12px;color:#4b5563;text-align:center;">
            Tiresias by Saluca Labs &mdash; Agent identity infrastructure for the AI era.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""


def _cta_button(url: str, label: str, color: str = "#d4a853") -> str:
    text_color = "#0a0e1a" if color == "#d4a853" else "#ffffff"
    return (
        "\n<table cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 auto 24px;\">\n"
        "  <tr>\n"
        f"    <td style=\"background:{color};border-radius:8px;padding:14px 32px;\">\n"
        f"      <a href=\"{url}\" style=\"color:{text_color};text-decoration:none;font-size:15px;font-weight:600;display:block;\">{label}</a>\n"
        "    </td>\n"
        "  </tr>\n"
        "</table>"
    )


def _kv_row(label: str, value: str) -> str:
    return (
        f'<tr>'
        f'<td style="font-size:13px;color:#6b7280;padding:4px 0;">{label}</td>'
        f'<td style="font-size:13px;color:#e5e7eb;padding:4px 0;text-align:right;">{value}</td>'
        f'</tr>'
    )


# ---------------------------------------------------------------------------
# EMAIL-01: Welcome
# ---------------------------------------------------------------------------

def render_welcome(
    *,
    contact_name: str,
    soulkey: str,
    quickstart_url: str = "https://tiresias.network/quickstart",
    docs_url: str = "https://tiresias.network/docs",
) -> str:
    """Welcome email sent immediately after registration."""
    body = (
        f'\n<p style="margin:0 0 16px;font-size:16px;color:#e5e7eb;">Welcome, {contact_name}!</p>\n'
        f'<p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.6;">\n'
        f'  Your Tiresias account is ready. Below is your soulkey &mdash; save it now.\n'
        f'  It will not be shown again.\n'
        f'</p>\n'
        f'<!-- Soulkey box -->\n'
        f'<table width="100%" cellpadding="0" cellspacing="0"\n'
        f'       style="background:#0a0e1a;border-radius:8px;border:1px solid #1f2937;margin-bottom:24px;">\n'
        f'  <tr>\n'
        f'    <td style="padding:16px 20px;">\n'
        f'      <p style="margin:0 0 8px;font-size:12px;color:#6b7280;letter-spacing:1px;">YOUR SOULKEY</p>\n'
        f'      <p style="margin:0;font-size:13px;color:#2dd4bf;font-family:\'Courier New\',monospace;word-break:break-all;">{soulkey}</p>\n'
        f'    </td>\n'
        f'  </tr>\n'
        f'</table>\n'
        + _cta_button(quickstart_url, "Start Quickstart")
        + f'\n<p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">\n'
        f'  Or explore the docs: <a href="{docs_url}" style="color:#2dd4bf;">{docs_url}</a>\n'
        f'</p>\n'
        f'<p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">\n'
        f'  If you did not create this account, contact support immediately at\n'
        f'  <a href="mailto:support@saluca.com" style="color:#d4a853;">support@saluca.com</a>.\n'
        f'</p>'
    )
    return _HEADER + body + _FOOTER


# ---------------------------------------------------------------------------
# EMAIL-02: Trial expiring (day 10 of 14)
# ---------------------------------------------------------------------------

def render_trial_expiring(
    *,
    contact_name: str,
    days_remaining: int,
    agents_used: int,
    requests_used: int,
    upgrade_url: str = "https://tiresias.network/upgrade",
) -> str:
    """Trial-expiring warning — day 10 of 14."""
    plural = "s" if days_remaining != 1 else ""
    body = (
        f'\n<p style="margin:0 0 16px;font-size:16px;color:#e5e7eb;">Hi {contact_name},</p>\n'
        f'<p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.6;">\n'
        f'  Your Tiresias trial ends in <strong style="color:#f59e0b;">{days_remaining} day{plural}</strong>.\n'
        f'  Upgrade now to keep your data and avoid any interruption.\n'
        f'</p>\n'
        f'<!-- Usage summary -->\n'
        f'<table width="100%" cellpadding="0" cellspacing="0"\n'
        f'       style="background:#0a0e1a;border-radius:8px;border:1px solid #1f2937;margin-bottom:24px;">\n'
        f'  <tr>\n'
        f'    <td style="padding:16px 20px;">\n'
        f'      <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#d4a853;">Trial Usage Summary</p>\n'
        f'      <table width="100%" cellpadding="0" cellspacing="0">\n'
        + _kv_row("Agents registered", str(agents_used))
        + _kv_row("API requests sent", f"{requests_used:,}")
        + _kv_row("Days remaining", str(days_remaining))
        + f'\n      </table>\n'
        f'    </td>\n'
        f'  </tr>\n'
        f'</table>\n'
        + _cta_button(upgrade_url, "Upgrade Now", "#d4a853")
        + f'\n<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">\n'
        f'  After your trial ends, your account reverts to Community tier and data is preserved for 30 days.\n'
        f'</p>'
    )
    return _HEADER + body + _FOOTER


# ---------------------------------------------------------------------------
# EMAIL-03: Trial expired
# ---------------------------------------------------------------------------

def render_trial_expired(
    *,
    contact_name: str,
    data_retention_days: int = 30,
    upgrade_url: str = "https://tiresias.network/upgrade",
) -> str:
    """Trial-expired email — sent when trial ends without payment."""
    body = (
        f'\n<p style="margin:0 0 16px;font-size:16px;color:#e5e7eb;">Hi {contact_name},</p>\n'
        f'<p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.6;">\n'
        f'  Your Tiresias trial has ended and your account has been moved to the\n'
        f'  <strong style="color:#e5e7eb;">Community tier</strong>.\n'
        f'</p>\n'
        f'<!-- Retention notice -->\n'
        f'<table width="100%" cellpadding="0" cellspacing="0"\n'
        f'       style="background:#0a0e1a;border-radius:8px;border:1px solid rgba(245,158,11,0.3);margin-bottom:24px;">\n'
        f'  <tr>\n'
        f'    <td style="padding:16px 20px;">\n'
        f'      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#f59e0b;">Data Retention Notice</p>\n'
        f'      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">\n'
        f'        Your historical data (traces, sessions, anomaly logs) is preserved for\n'
        f'        <strong style="color:#e5e7eb;">{data_retention_days} days</strong>.\n'
        f'        After that, it will be permanently deleted. Upgrade to keep it.\n'
        f'      </p>\n'
        f'    </td>\n'
        f'  </tr>\n'
        f'</table>\n'
        + _cta_button(upgrade_url, "Upgrade to Keep Your Data", "#d4a853")
        + f'\n<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">\n'
        f'  Questions? Reply to this email or contact\n'
        f'  <a href="mailto:support@saluca.com" style="color:#2dd4bf;">support@saluca.com</a>.\n'
        f'</p>'
    )
    return _HEADER + body + _FOOTER


# ---------------------------------------------------------------------------
# EMAIL-04: Payment receipt
# ---------------------------------------------------------------------------

def render_payment_receipt(
    *,
    contact_name: str,
    amount_formatted: str,
    invoice_id: str,
    invoice_url: str,
    billing_reason: str = "subscription",
    tier: str = "Pro",
) -> str:
    """Payment receipt email — triggered by Stripe invoice.paid."""
    body = (
        f'\n<p style="margin:0 0 16px;font-size:16px;color:#e5e7eb;">Hi {contact_name},</p>\n'
        f'<p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.6;">\n'
        f'  Thank you &mdash; payment received for your Tiresias <strong style="color:#e5e7eb;">{tier}</strong> subscription.\n'
        f'</p>\n'
        f'<!-- Receipt box -->\n'
        f'<table width="100%" cellpadding="0" cellspacing="0"\n'
        f'       style="background:#0a0e1a;border-radius:8px;border:1px solid #1f2937;margin-bottom:24px;">\n'
        f'  <tr>\n'
        f'    <td style="padding:16px 20px;">\n'
        f'      <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#d4a853;">Payment Receipt</p>\n'
        f'      <table width="100%" cellpadding="0" cellspacing="0">\n'
        + _kv_row("Amount charged", amount_formatted)
        + _kv_row("Invoice ID", invoice_id)
        + _kv_row("Billing reason", billing_reason.replace("_", " ").title())
        + _kv_row("Plan", tier)
        + f'\n      </table>\n'
        f'    </td>\n'
        f'  </tr>\n'
        f'</table>\n'
        + _cta_button(invoice_url, "View Invoice PDF")
        + f'\n<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">\n'
        f'  Invoices are also available in your\n'
        f'  <a href="https://tiresias.network/settings/billing" style="color:#2dd4bf;">billing settings</a>.\n'
        f'  For billing questions, contact\n'
        f'  <a href="mailto:billing@saluca.com" style="color:#2dd4bf;">billing@saluca.com</a>.\n'
        f'</p>'
    )
    return _HEADER + body + _FOOTER


# ---------------------------------------------------------------------------
# EMAIL-05: P0 acknowledgment
# ---------------------------------------------------------------------------

def render_p0_acknowledged(
    *,
    contact_name: str,
    ticket_id: str,
    subject: str,
    sla_hours: int = 4,
    portal_url: str = "https://tiresias.network/support",
) -> str:
    """P0 ticket acknowledgment — sent to customer when P0 is acknowledged by Saluca."""
    truncated_subject = subject[:60] + ("..." if len(subject) > 60 else "")
    body = (
        f'\n<p style="margin:0 0 16px;font-size:16px;color:#e5e7eb;">Hi {contact_name},</p>\n'
        f'<p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.6;">\n'
        f'  Your P0 support ticket has been acknowledged. A Saluca engineer is actively working on it.\n'
        f'</p>\n'
        f'<!-- Ticket details -->\n'
        f'<table width="100%" cellpadding="0" cellspacing="0"\n'
        f'       style="background:#0a0e1a;border-radius:8px;border:1px solid rgba(45,212,191,0.3);margin-bottom:24px;">\n'
        f'  <tr>\n'
        f'    <td style="padding:16px 20px;">\n'
        f'      <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#2dd4bf;">Ticket Details</p>\n'
        f'      <table width="100%" cellpadding="0" cellspacing="0">\n'
        + _kv_row("Ticket ID", ticket_id)
        + _kv_row("Subject", truncated_subject)
        + _kv_row("Severity", "P0 &mdash; Critical")
        + _kv_row("Response SLA", f"Within {sla_hours} hours")
        + f'\n      </table>\n'
        f'    </td>\n'
        f'  </tr>\n'
        f'</table>\n'
        + _cta_button(portal_url, "View Ticket Status")
        + f'\n<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">\n'
        f'  You will receive a follow-up once the issue is resolved. If this is urgent,\n'
        f'  reply directly to this email with additional context.\n'
        f'</p>'
    )
    return _HEADER + body + _FOOTER
