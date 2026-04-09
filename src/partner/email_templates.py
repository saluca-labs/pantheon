"""
Partner program email HTML templates.

Each render_* function returns a tuple of (subject, html_body).
All templates reuse the shared Tiresias layout helpers from src.email.templates
to ensure brand consistency.

Brand palette: bg #0a0e1a, card #111827, gold #d4a853, teal #2dd4bf,
border #1f2937, muted #6b7280/#9ca3af, body text #e5e7eb.
"""

from __future__ import annotations

from src.email.templates import _HEADER, _FOOTER, _cta_button, _kv_row


# ---------------------------------------------------------------------------
# Shared helpers (partner-specific)
# ---------------------------------------------------------------------------

def _info_box(title: str, rows_html: str, border_color: str = "#2dd4bf") -> str:
    """Bordered info box with a title and key-value rows inside."""
    return (
        f'<table width="100%" cellpadding="0" cellspacing="0"\n'
        f'       style="background:#0a0e1a;border-radius:8px;'
        f'border:1px solid {border_color};margin-bottom:24px;">\n'
        f'  <tr>\n'
        f'    <td style="padding:16px 20px;">\n'
        f'      <p style="margin:0 0 12px;font-size:13px;font-weight:600;'
        f'color:{border_color};">{title}</p>\n'
        f'      <table width="100%" cellpadding="0" cellspacing="0">\n'
        f'{rows_html}'
        f'\n      </table>\n'
        f'    </td>\n'
        f'  </tr>\n'
        f'</table>\n'
    )


def _notice_box(title: str, message: str, border_color: str = "#f59e0b") -> str:
    """Bordered notice box with a title and free-text message."""
    return (
        f'<table width="100%" cellpadding="0" cellspacing="0"\n'
        f'       style="background:#0a0e1a;border-radius:8px;'
        f'border:1px solid rgba({_hex_to_rgba(border_color)},0.3);margin-bottom:24px;">\n'
        f'  <tr>\n'
        f'    <td style="padding:16px 20px;">\n'
        f'      <p style="margin:0 0 8px;font-size:13px;font-weight:600;'
        f'color:{border_color};">{title}</p>\n'
        f'      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">'
        f'{message}</p>\n'
        f'    </td>\n'
        f'  </tr>\n'
        f'</table>\n'
    )


def _hex_to_rgba(hex_color: str) -> str:
    """Convert #RRGGBB to 'R,G,B' for use in rgba()."""
    h = hex_color.lstrip("#")
    return f"{int(h[0:2], 16)},{int(h[2:4], 16)},{int(h[4:6], 16)}"


def _p(text: str, *, color: str = "#9ca3af", size: str = "15px",
       margin: str = "0 0 24px") -> str:
    """Standard paragraph element."""
    return (
        f'<p style="margin:{margin};font-size:{size};color:{color};'
        f'line-height:1.6;">{text}</p>\n'
    )


def _greeting(name: str) -> str:
    return (
        f'<p style="margin:0 0 16px;font-size:16px;color:#e5e7eb;">'
        f'Hi {name},</p>\n'
    )


def _support_line(email: str = "partners@saluca.com") -> str:
    return (
        f'<p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">\n'
        f'  Questions? Contact '
        f'<a href="mailto:{email}" style="color:#2dd4bf;">{email}</a> '
        f'or reply to this email.\n'
        f'</p>'
    )


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-01: Partner Invitation
# ---------------------------------------------------------------------------

def render_partner_invitation(
    partner_name: str,
    onboarding_url: str,
    expires_in_days: int = 30,
) -> tuple[str, str]:
    """Render the partner invitation email.

    Returns (subject, html_body).
    """
    subject = "You're invited to the Tiresias Partner Program"

    body = (
        _greeting(partner_name)
        + _p(
            'Your application to the '
            '<strong style="color:#d4a853;">Tiresias Partner Program</strong> '
            'has been approved.'
        )
        + _p(
            'What Tiresias offers partners:',
            color="#e5e7eb", size="14px", margin="0 0 8px",
        )
        + '<ul style="margin:0 0 24px;padding-left:20px;font-size:13px;'
          'color:#9ca3af;line-height:1.8;">\n'
          '  <li>Recurring revenue on every customer you bring to the platform</li>\n'
          '  <li>Dedicated partner dashboard with real-time MRR and commission tracking</li>\n'
          '  <li>Sales kit, documentation, and referral tools</li>\n'
          '  <li>For MSSPs: full tenant provisioning, white-label branding, and managed SOC tooling</li>\n'
          '</ul>\n'
        + _p(
            'Complete your onboarding to activate your partner account and '
            'access your dashboard.',
        )
        + _cta_button(onboarding_url, "Complete Your Partner Onboarding")
        + f'\n<p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">\n'
          f'  This invitation expires in '
          f'<strong style="color:#e5e7eb;">{expires_in_days} days</strong>. '
          f'After expiration, contact '
          f'<a href="mailto:partners@saluca.com" style="color:#2dd4bf;">'
          f'partners@saluca.com</a> to request a new link.\n'
          f'</p>'
    )
    html = _HEADER + body + _FOOTER
    return subject, html


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-02: Welcome / Onboarding Complete
# ---------------------------------------------------------------------------

def render_partner_welcome(
    partner_name: str,
    partner_type: str,
    commission_rate: float,
    dashboard_url: str,
) -> tuple[str, str]:
    """Render the partner welcome email.

    ``commission_rate`` is a decimal (e.g. 0.25 for 25%).
    Returns (subject, html_body).
    """
    subject = "Welcome to the Tiresias Partner Program"
    pct = f"{commission_rate * 100:.0f}%"

    rows = (
        _kv_row("Partner Type", partner_type)
        + _kv_row("Commission Rate", pct)
        + _kv_row("Dashboard", f'<a href="{dashboard_url}" style="color:#2dd4bf;">'
                  f'{dashboard_url}</a>')
    )

    body = (
        f'<p style="margin:0 0 16px;font-size:16px;color:#e5e7eb;">'
        f'Welcome aboard, {partner_name}!</p>\n'
        + _p(
            'Your Tiresias partner account is now active. '
            'Here are your account details:'
        )
        + _info_box("Account Details", rows, border_color="#d4a853")
        + _p(
            '<strong style="color:#e5e7eb;">Next steps:</strong>',
            margin="0 0 8px",
        )
        + '<ol style="margin:0 0 24px;padding-left:20px;font-size:13px;'
          'color:#9ca3af;line-height:1.8;">\n'
          '  <li><strong style="color:#e5e7eb;">Set up Stripe Connect</strong> '
          'to enable commission payouts</li>\n'
          '  <li><strong style="color:#e5e7eb;">Review the sales kit</strong> '
          'and partner documentation</li>\n'
          '  <li><strong style="color:#e5e7eb;">Share your referral link</strong> '
          'to start earning</li>\n'
          '</ol>\n'
        + _cta_button(dashboard_url, "Access Your Partner Dashboard")
        + _support_line()
    )
    html = _HEADER + body + _FOOTER
    return subject, html


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-03: Stripe Connect Setup Reminder
# ---------------------------------------------------------------------------

def render_connect_setup_reminder(
    partner_name: str,
    onboarding_url: str,
) -> tuple[str, str]:
    """Render the Stripe Connect setup reminder email.

    Returns (subject, html_body).
    """
    subject = "Complete your Stripe Connect setup"

    body = (
        _greeting(partner_name)
        + _p(
            'Your Tiresias partner account is active, but Stripe Connect '
            'setup is not yet complete.'
        )
        + _notice_box(
            "Payouts Require Stripe Connect",
            'Without Stripe Connect, commission payouts cannot be processed. '
            'Any earned commissions will accrue but remain frozen until '
            'setup is complete.',
            border_color="#f59e0b",
        )
        + _p(
            'Completing setup takes about <strong style="color:#e5e7eb;">'
            '5 minutes</strong> and requires:',
            margin="0 0 8px",
        )
        + '<ul style="margin:0 0 24px;padding-left:20px;font-size:13px;'
          'color:#9ca3af;line-height:1.8;">\n'
          '  <li>Business verification details</li>\n'
          '  <li>Bank account for payouts</li>\n'
          '</ul>\n'
        + _cta_button(onboarding_url, "Complete Stripe Setup", "#2dd4bf")
        + _support_line()
    )
    html = _HEADER + body + _FOOTER
    return subject, html


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-04: Partner Deactivated
# ---------------------------------------------------------------------------

def render_partner_deactivated(
    partner_name: str,
    reason: str,
) -> tuple[str, str]:
    """Render the partner deactivation/suspension notice.

    Tone: professional and factual. No warm greeting.
    Returns (subject, html_body).
    """
    subject = "Your Tiresias partner account has been suspended"

    body = (
        f'<p style="margin:0 0 16px;font-size:16px;color:#e5e7eb;">'
        f'{partner_name},</p>\n'
        + _p(
            'Your Tiresias partner account has been '
            '<strong style="color:#f59e0b;">suspended</strong>.'
        )
        + _notice_box("Reason", reason, border_color="#f59e0b")
        + _p(
            '<strong style="color:#e5e7eb;">While your account is suspended:</strong>',
            margin="0 0 8px",
        )
        + '<ul style="margin:0 0 24px;padding-left:20px;font-size:13px;'
          'color:#9ca3af;line-height:1.8;">\n'
          '  <li>Commission payouts are frozen</li>\n'
          '  <li>Tenant provisioning is disabled (MSSP partners)</li>\n'
          '  <li>Referral link attribution is paused (Resellers)</li>\n'
          '  <li>Existing customers remain operational and are not affected</li>\n'
          '</ul>\n'
        + f'<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">\n'
          f'  To appeal this decision or request reinstatement, reply to this '
          f'email or contact '
          f'<a href="mailto:partners@saluca.com" style="color:#2dd4bf;">'
          f'partners@saluca.com</a> with your partner code and any relevant '
          f'context.\n'
          f'</p>'
    )
    html = _HEADER + body + _FOOTER
    return subject, html


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-05: Terms Updated
# ---------------------------------------------------------------------------

def render_partner_terms_updated(
    partner_name: str,
    changes: list[dict],
) -> tuple[str, str]:
    """Render the partner terms updated notice.

    ``changes`` is a list of {"field": str, "old_value": str, "new_value": str}.
    Returns (subject, html_body).
    """
    subject = "Your Tiresias partner terms have been updated"

    # Build change rows as a three-column table
    change_rows = (
        '<tr>'
        '<td style="font-size:12px;color:#6b7280;padding:4px 0;'
        'font-weight:600;">Field</td>'
        '<td style="font-size:12px;color:#6b7280;padding:4px 0;'
        'text-align:center;font-weight:600;">Previous</td>'
        '<td style="font-size:12px;color:#6b7280;padding:4px 0;'
        'text-align:right;font-weight:600;">New</td>'
        '</tr>\n'
        '<tr><td colspan="3" style="border-bottom:1px solid #1f2937;'
        'padding:0;"></td></tr>\n'
    )
    for change in changes:
        field = change.get("field", "")
        old_val = change.get("old_value", "N/A")
        new_val = change.get("new_value", "N/A")
        change_rows += (
            f'<tr>'
            f'<td style="font-size:13px;color:#9ca3af;padding:6px 0;">'
            f'{field}</td>'
            f'<td style="font-size:13px;color:#6b7280;padding:6px 0;'
            f'text-align:center;">{old_val}</td>'
            f'<td style="font-size:13px;color:#e5e7eb;padding:6px 0;'
            f'text-align:right;font-weight:600;">{new_val}</td>'
            f'</tr>\n'
        )

    changes_table = (
        f'<table width="100%" cellpadding="0" cellspacing="0"\n'
        f'       style="background:#0a0e1a;border-radius:8px;'
        f'border:1px solid #1f2937;margin-bottom:24px;">\n'
        f'  <tr>\n'
        f'    <td style="padding:16px 20px;">\n'
        f'      <p style="margin:0 0 12px;font-size:13px;font-weight:600;'
        f'color:#d4a853;">Changes</p>\n'
        f'      <table width="100%" cellpadding="0" cellspacing="0">\n'
        f'{change_rows}'
        f'      </table>\n'
        f'    </td>\n'
        f'  </tr>\n'
        f'</table>\n'
    )

    body = (
        _greeting(partner_name)
        + _p(
            'The terms for your Tiresias partner account have been updated, '
            'effective immediately.'
        )
        + changes_table
        + _p(
            'These changes apply to all commission calculations starting now. '
            'Historical earnings are not affected.',
            size="13px", color="#9ca3af",
        )
        + _support_line()
    )
    html = _HEADER + body + _FOOTER
    return subject, html


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-06: Monthly Commission Report
# ---------------------------------------------------------------------------

def render_monthly_commission_report(
    partner_name: str,
    month: str,
    referral_count: int,
    mrr_attributed: float,
    commission_earned: float,
    payout_amount: float,
    dashboard_url: str,
) -> tuple[str, str]:
    """Render the monthly partner commission report email.

    Currency values are formatted as $X,XXX.XX.
    Returns (subject, html_body).
    """
    subject = f"Tiresias Partner Report \u2014 {month}"

    mrr_fmt = f"${mrr_attributed:,.2f}"
    comm_fmt = f"${commission_earned:,.2f}"
    payout_fmt = f"${payout_amount:,.2f}"

    summary_rows = (
        _kv_row("Active Referrals", str(referral_count))
        + _kv_row("Attributed MRR", mrr_fmt)
        + _kv_row("Commission Earned", comm_fmt)
    )

    payout_rows = (
        _kv_row("Payout Amount", payout_fmt)
    )

    body = (
        _greeting(partner_name)
        + _p(
            f'Here is your Tiresias partner commission report for '
            f'<strong style="color:#e5e7eb;">{month}</strong>.'
        )
        + _info_box("Monthly Summary", summary_rows, border_color="#d4a853")
        + _info_box("Payout", payout_rows, border_color="#2dd4bf")
        + _cta_button(dashboard_url, "View Full Report")
        + _support_line()
    )
    html = _HEADER + body + _FOOTER
    return subject, html


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-07: Payout Processed
# ---------------------------------------------------------------------------

def render_payout_processed(
    partner_name: str,
    amount: float,
    period: str,
    transfer_id: str,
) -> tuple[str, str]:
    """Render the payout processed confirmation email.

    Returns (subject, html_body).
    """
    amount_fmt = f"${amount:,.2f}"
    subject = f"Tiresias payout processed \u2014 {amount_fmt}"

    rows = (
        _kv_row("Amount", amount_fmt)
        + _kv_row("Period", period)
        + _kv_row("Transfer ID", f'<code style="color:#2dd4bf;">{transfer_id}</code>')
    )

    body = (
        _greeting(partner_name)
        + _p(
            'Your Tiresias partner commission payout has been processed.'
        )
        + _info_box("Payout Details", rows, border_color="#d4a853")
        + _p(
            'Funds should arrive in your connected bank account within '
            '<strong style="color:#e5e7eb;">2 to 3 business days</strong>, '
            'depending on your bank.',
            size="13px",
        )
        + _support_line()
    )
    html = _HEADER + body + _FOOTER
    return subject, html


# ---------------------------------------------------------------------------
# PARTNER-EMAIL-08: Payout Failed
# ---------------------------------------------------------------------------

def render_payout_failed(
    partner_name: str,
    amount: float,
    reason: str,
    dashboard_url: str,
) -> tuple[str, str]:
    """Render the payout failed notice email.

    Returns (subject, html_body).
    """
    amount_fmt = f"${amount:,.2f}"
    subject = "Action required: Tiresias payout failed"

    error_rows = (
        _kv_row("Amount", amount_fmt)
        + _kv_row("Reason", reason)
    )

    body = (
        f'<p style="margin:0 0 16px;font-size:16px;color:#e5e7eb;">'
        f'{partner_name},</p>\n'
        + _p(
            'A payout to your Tiresias partner account has '
            '<strong style="color:#ef4444;">failed</strong>.'
        )
        + (
            f'<table width="100%" cellpadding="0" cellspacing="0"\n'
            f'       style="background:#0a0e1a;border-radius:8px;'
            f'border:1px solid rgba(239,68,68,0.4);margin-bottom:24px;">\n'
            f'  <tr>\n'
            f'    <td style="padding:16px 20px;">\n'
            f'      <p style="margin:0 0 12px;font-size:13px;font-weight:600;'
            f'color:#ef4444;">Payout Failure</p>\n'
            f'      <table width="100%" cellpadding="0" cellspacing="0">\n'
            f'{error_rows}'
            f'\n      </table>\n'
            f'    </td>\n'
            f'  </tr>\n'
            f'</table>\n'
        )
        + _p(
            'This is most commonly caused by outdated or incorrect bank '
            'account details in your Stripe Connect profile.',
            size="13px",
        )
        + _p(
            '<strong style="color:#e5e7eb;">Action required:</strong>',
            margin="0 0 8px",
        )
        + '<ol style="margin:0 0 24px;padding-left:20px;font-size:13px;'
          'color:#9ca3af;line-height:1.8;">\n'
          '  <li>Review your connected bank account details</li>\n'
          '  <li>Update or re-verify your payout method</li>\n'
          '  <li>The payout will be retried automatically on the next cycle</li>\n'
          '</ol>\n'
        + _cta_button(dashboard_url, "Update Payout Details", "#ef4444")
        + f'\n<p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">\n'
          f'  Our support team has been notified. If you need assistance, contact '
          f'<a href="mailto:partners@saluca.com" style="color:#2dd4bf;">'
          f'partners@saluca.com</a>.\n'
          f'</p>'
    )
    html = _HEADER + body + _FOOTER
    return subject, html
