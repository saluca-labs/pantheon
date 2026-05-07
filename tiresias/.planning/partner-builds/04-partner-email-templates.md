# 04 Partner Email Templates

**Status:** Spec Complete
**Author:** Saluca Engineering
**Date:** 2026-04-06
**Depends on:** 01 (DB schema), 02 (partner router), 03 (Stripe Connect)
**Modifies existing files:** None. All new files.

---

## 1. Existing Email System Audit

### 1.1 Email Provider

**Resend** (via `resend` Python SDK). All outbound email flows through a single async sender at `src/email/sender.py`. The Resend API key is loaded from `settings.resend_api_key` (environment variable `RESEND_API_KEY`). The "from" address is `settings.trial_from_email`.

### 1.2 Template Structure

Templates are **inline HTML strings** built by Python `render_*` functions in `src/email/templates.py`. They use table-based, inline-style layout for email-client compatibility. Shared layout components:

| Component | Description |
|---|---|
| `_HEADER` | DOCTYPE, body wrapper, outer table (#0a0e1a bg), card table (#111827 bg), branded header with "TIRESIAS / SECURITY PLATFORM" |
| `_FOOTER` | Footer row with "Tiresias by Saluca Labs" tagline, dark background (#0d1117) |
| `_cta_button(url, label, color)` | Centered CTA button, defaults to gold (#d4a853) with dark text |
| `_kv_row(label, value)` | Two-column key/value row for data tables |

**Brand palette:** bg `#0a0e1a`, card `#111827`, gold `#d4a853`, teal `#2dd4bf`, border `#1f2937`, muted text `#6b7280`/`#9ca3af`, body text `#e5e7eb`.

### 1.3 Template Variable Injection

Python f-strings inside render functions. No Jinja, no template engine. Variables are passed as keyword arguments to each `render_*` function. The waitlist module (`src/waitlist/email.py`) uses `.format()` on a string constant instead, but the canonical pattern in `src/email/templates.py` is f-strings.

### 1.4 Email Triggering

Trigger functions live in `src/email/triggers.py`. Each `on_*` async function:
1. Calls the corresponding `render_*` template function to produce HTML.
2. Calls `send_email(to=, subject=, html=, tag=)` from `src/email/sender.py`.
3. Wraps everything in try/except; failures are logged but never re-raised (non-fatal).

Callers invoke trigger functions directly from route handlers, cron jobs, or webhook handlers. There is no queue or background worker; sends are inline-async via Resend's HTTP API.

### 1.5 Existing Templates (5 total)

| ID | Template | Trigger |
|---|---|---|
| EMAIL-01 | Welcome (soulkey delivery) | Registration |
| EMAIL-02 | Trial expiring (day 10) | Trial cron |
| EMAIL-03 | Trial expired | Trial cron (day 14) |
| EMAIL-04 | Payment receipt | Stripe `invoice.paid` webhook |
| EMAIL-05 | P0 acknowledgment | Support router |
| (waitlist) | Waitlist confirmation | Waitlist signup |

### 1.6 Settings Referenced

| Setting | Used for |
|---|---|
| `resend_api_key` | Resend SDK authentication |
| `trial_from_email` | "From" address on all emails |
| `support_email` | Linked in welcome and trial-expired templates |
| `billing_email` | Linked in payment receipt template |

---

## 2. New Files

All partner email code lives in new files. Zero modifications to existing email infrastructure.

```
src/partner/
    __init__.py              (already planned in partner router spec)
    email_templates.py       (NEW - all 8 render_* functions)
    email_triggers.py        (NEW - all on_* trigger functions)
    slack_notifications.py   (NEW - webhook payloads for #partner-ops)
```

The existing `src/email/sender.py::send_email()` is reused as-is for sending. The existing `src/email/templates.py` shared helpers (`_HEADER`, `_FOOTER`, `_cta_button`, `_kv_row`) are imported rather than duplicated.

---

## 3. Template Specifications

### 3.1 PARTNER-EMAIL-01: Partner Invitation

| Field | Value |
|---|---|
| **ID** | `PARTNER-EMAIL-01` |
| **Subject** | `You're invited to the Tiresias Partner Program` |
| **Trigger** | Admin calls `POST /v1/admin/partners/{id}/approve` |
| **Recipient** | Prospective partner's `contact_email` from application |
| **Tag** | `partner_invitation` |

**Template variables:**

| Variable | Type | Source |
|---|---|---|
| `contact_name` | str | `_partner_applications.contact_name` |
| `company_name` | str | `_partner_applications.company_name` |
| `partner_type` | str | `"Reseller"` or `"MSSP Partner"` (display name) |
| `onboarding_url` | str | `https://tiresias.network/partners/onboard?token={invitation_token}` |
| `token_expires_at` | str | Human-readable expiration, e.g., "April 13, 2026" |
| `partner_code` | str | Generated partner code, e.g., `ACME-SEC-2026` |

**Content outline:**

```
[HEADER]

Hi {contact_name},

Your application to the Tiresias Partner Program has been approved.

[Info box - teal border]
  Partner Type:    {partner_type}
  Company:         {company_name}
  Partner Code:    {partner_code}

What Tiresias offers partners:
  - Recurring revenue on every customer you bring to the platform
  - Dedicated partner dashboard with real-time MRR and commission tracking
  - For MSSPs: full tenant provisioning, white-label branding, and managed SOC tooling
  - For Resellers: referral link, automatic attribution, and zero operational overhead

Complete your onboarding to activate your partner account and access
your dashboard.

[CTA: "Complete Your Partner Onboarding" -> onboarding_url]

This invitation expires on {token_expires_at}. After expiration, contact
partners@saluca.com to request a new link.

[FOOTER]
```

**Render function signature:**

```python
def render_partner_invitation(
    *,
    contact_name: str,
    company_name: str,
    partner_type: str,
    partner_code: str,
    onboarding_url: str,
    token_expires_at: str,
) -> str:
```

---

### 3.2 PARTNER-EMAIL-02: Welcome / Onboarding Complete

| Field | Value |
|---|---|
| **ID** | `PARTNER-EMAIL-02` |
| **Subject** | `Welcome to the Tiresias Partner Program, {company_name}` |
| **Trigger** | Partner redeems invitation token and completes onboarding |
| **Recipient** | Partner `contact_email` |
| **Tag** | `partner_welcome` |

**Template variables:**

| Variable | Type | Source |
|---|---|---|
| `contact_name` | str | `_partners.contact_email` (resolved name) |
| `company_name` | str | `_partners.company_name` |
| `partner_type` | str | Display name |
| `partner_code` | str | `_partners.partner_code` |
| `dashboard_url` | str | `https://tiresias.network/dashboard/partner` |
| `api_soulkey` | str | Issued admin soulkey for partner tenant |
| `docs_url` | str | `https://tiresias.network/docs/partners` |
| `stripe_connect_needed` | bool | Whether Stripe Connect setup is required |
| `stripe_connect_url` | str | Link to initiate Stripe Connect onboarding |

**Content outline:**

```
[HEADER]

Welcome aboard, {contact_name}!

Your Tiresias partner account for {company_name} is now active.

[Info box - gold border]
  Partner Code:    {partner_code}
  Partner Type:    {partner_type}
  Dashboard:       {dashboard_url}

Your API soulkey (save it now, it will not be shown again):

[Soulkey box - dark bg, teal monospace]
  {api_soulkey}

Next steps:

  1. Access your partner dashboard to explore your metrics and tools
  2. {IF stripe_connect_needed} Set up Stripe Connect to enable commission payouts
  3. Review the partner sales kit and documentation
  4. {IF reseller} Share your referral link to start earning
     {IF mssp} Provision your first customer tenant

[CTA: "Access Your Partner Dashboard" -> dashboard_url]

{IF stripe_connect_needed}
  [Secondary CTA: "Set Up Stripe Connect" -> stripe_connect_url, teal]

Questions? Reach us at partners@saluca.com or reply to this email.

[FOOTER]
```

**Render function signature:**

```python
def render_partner_welcome(
    *,
    contact_name: str,
    company_name: str,
    partner_type: str,
    partner_code: str,
    dashboard_url: str = "https://tiresias.network/dashboard/partner",
    api_soulkey: str,
    docs_url: str = "https://tiresias.network/docs/partners",
    stripe_connect_needed: bool = True,
    stripe_connect_url: str = "",
) -> str:
```

---

### 3.3 PARTNER-EMAIL-03: Stripe Connect Setup Reminder

| Field | Value |
|---|---|
| **ID** | `PARTNER-EMAIL-03` |
| **Subject** | `Action needed: complete Stripe setup for your Tiresias partner payouts` |
| **Trigger** | 48 hours after onboarding if `_partners.stripe_connect_account_id` is NULL |
| **Recipient** | Partner `contact_email` |
| **Tag** | `partner_stripe_reminder` |

**Template variables:**

| Variable | Type | Source |
|---|---|---|
| `contact_name` | str | Partner contact name |
| `company_name` | str | Partner company name |
| `stripe_connect_url` | str | Link to resume Stripe Connect onboarding |
| `days_since_onboarding` | int | Days since `_partners.approved_at` |

**Content outline:**

```
[HEADER]

Hi {contact_name},

Your Tiresias partner account for {company_name} has been active for
{days_since_onboarding} days, but Stripe Connect setup is not yet complete.

[Warning box - amber border]
  Without Stripe Connect, commission payouts cannot be processed.
  Any earned commissions will accrue but remain frozen until setup
  is complete.

Completing setup takes about 5 minutes and requires:
  - Business verification details
  - Bank account for payouts

[CTA: "Complete Stripe Setup" -> stripe_connect_url]

If you have questions about the setup process, contact
partners@saluca.com.

[FOOTER]
```

**Render function signature:**

```python
def render_stripe_connect_reminder(
    *,
    contact_name: str,
    company_name: str,
    stripe_connect_url: str,
    days_since_onboarding: int = 2,
) -> str:
```

---

### 3.4 PARTNER-EMAIL-04: Partner Deactivation Notice

| Field | Value |
|---|---|
| **ID** | `PARTNER-EMAIL-04` |
| **Subject** | `Your Tiresias partner account has been suspended` |
| **Trigger** | Admin calls `POST /v1/admin/partners/{id}/suspend` |
| **Recipient** | Partner `contact_email` |
| **Tag** | `partner_deactivated` |

**Template variables:**

| Variable | Type | Source |
|---|---|---|
| `contact_name` | str | Partner contact name |
| `company_name` | str | Partner company name |
| `reason` | str | Admin-provided reason, or `"No reason provided."` |
| `suspended_at` | str | Human-readable timestamp |
| `appeal_email` | str | `partners@saluca.com` |

**Content outline:**

```
[HEADER]

{contact_name},

The Tiresias partner account for {company_name} has been suspended
effective {suspended_at}.

[Info box - red/amber border (#f59e0b)]
  Reason: {reason}

While your account is suspended:
  - Commission payouts are frozen
  - Tenant provisioning is disabled (MSSP partners)
  - Referral link attribution is paused (Resellers)
  - Existing sub-tenants remain operational but cannot be modified

To appeal this decision or request reinstatement, contact
{appeal_email} with your partner code and any relevant context.

[FOOTER]
```

**Tone:** Professional and factual. No warm greetings. No apology. State facts, impact, and process.

**Render function signature:**

```python
def render_partner_deactivated(
    *,
    contact_name: str,
    company_name: str,
    reason: str = "No reason provided.",
    suspended_at: str,
    appeal_email: str = "partners@saluca.com",
) -> str:
```

---

### 3.5 PARTNER-EMAIL-05: Terms Updated Notice

| Field | Value |
|---|---|
| **ID** | `PARTNER-EMAIL-05` |
| **Subject** | `Your Tiresias partner terms have been updated` |
| **Trigger** | Admin updates `_partner_revshare_config` or partner tier |
| **Recipient** | Partner `contact_email` |
| **Tag** | `partner_terms_updated` |

**Template variables:**

| Variable | Type | Source |
|---|---|---|
| `contact_name` | str | Partner contact name |
| `company_name` | str | Partner company name |
| `changes` | list[dict] | List of `{"field": str, "old_value": str, "new_value": str}` |
| `effective_date` | str | Human-readable date |
| `dashboard_url` | str | Partner dashboard URL |

**Content outline:**

```
[HEADER]

Hi {contact_name},

The terms for your Tiresias partner account ({company_name}) have been
updated, effective {effective_date}.

[Changes table - dark bg]
  Field              Previous        New
  -----              --------        ---
  {for each change:}
  {change.field}     {change.old}    {change.new}

These changes apply to all commission calculations starting on the
effective date. Historical earnings are not affected.

[CTA: "View Full Terms in Dashboard" -> dashboard_url]

If you have questions about these changes, contact partners@saluca.com.

[FOOTER]
```

**Render function signature:**

```python
def render_partner_terms_updated(
    *,
    contact_name: str,
    company_name: str,
    changes: list[dict[str, str]],
    effective_date: str,
    dashboard_url: str = "https://tiresias.network/dashboard/partner",
) -> str:
```

---

### 3.6 PARTNER-EMAIL-06: Monthly Commission Report

| Field | Value |
|---|---|
| **ID** | `PARTNER-EMAIL-06` |
| **Subject** | `Tiresias Partner Report: {month_name} {year}` |
| **Trigger** | 1st of month, after reconciliation cron completes |
| **Recipient** | Partner `contact_email` |
| **Tag** | `partner_monthly_report` |

**Template variables:**

| Variable | Type | Source |
|---|---|---|
| `contact_name` | str | Partner contact name |
| `company_name` | str | Partner company name |
| `month_name` | str | e.g., "March" |
| `year` | int | e.g., 2026 |
| `total_referrals` | int | Active tenants/referrals in period |
| `new_referrals` | int | New tenants/referrals added in period |
| `gross_mrr_formatted` | str | e.g., "$4,988.00" |
| `revshare_pct` | str | e.g., "25%" |
| `commission_earned_formatted` | str | e.g., "$1,247.00" |
| `payout_amount_formatted` | str | Amount to be paid out (may differ if below threshold) |
| `payout_status` | str | "Scheduled", "Below threshold (rolling over)", "Paid" |
| `dashboard_url` | str | Partner dashboard URL |

**Content outline:**

```
[HEADER]

Hi {contact_name},

Here is your Tiresias partner commission report for
{month_name} {year}.

[Summary box - gold border]
  MONTHLY SUMMARY
  Active Referrals:       {total_referrals}
  New This Month:         {new_referrals}
  Attributed MRR:         {gross_mrr_formatted}
  Commission Rate:        {revshare_pct}
  Commission Earned:      {commission_earned_formatted}

[Payout box - teal border]
  PAYOUT
  Amount:                 {payout_amount_formatted}
  Status:                 {payout_status}

{IF payout_status == "Below threshold"}
  Your earned commission is below the minimum payout threshold.
  It will roll over to next month.

[CTA: "View Full Report" -> dashboard_url]

[FOOTER]
```

**Render function signature:**

```python
def render_monthly_commission_report(
    *,
    contact_name: str,
    company_name: str,
    month_name: str,
    year: int,
    total_referrals: int,
    new_referrals: int,
    gross_mrr_formatted: str,
    revshare_pct: str,
    commission_earned_formatted: str,
    payout_amount_formatted: str,
    payout_status: str,
    dashboard_url: str = "https://tiresias.network/dashboard/partner",
) -> str:
```

---

### 3.7 PARTNER-EMAIL-07: Payout Processed

| Field | Value |
|---|---|
| **ID** | `PARTNER-EMAIL-07` |
| **Subject** | `Tiresias payout processed: {amount_formatted}` |
| **Trigger** | Stripe Transfer succeeds (webhook: `transfer.paid` or `payout.paid`) |
| **Recipient** | Partner `contact_email` |
| **Tag** | `partner_payout_processed` |

**Template variables:**

| Variable | Type | Source |
|---|---|---|
| `contact_name` | str | Partner contact name |
| `amount_formatted` | str | e.g., "$1,247.00" |
| `payout_date` | str | Human-readable date |
| `period_start` | str | e.g., "March 1, 2026" |
| `period_end` | str | e.g., "March 31, 2026" |
| `stripe_transfer_id` | str | Stripe transfer ID for reference |
| `next_payout_date` | str | Expected next payout date |
| `dashboard_url` | str | Partner dashboard URL |

**Content outline:**

```
[HEADER]

Hi {contact_name},

Your Tiresias partner commission payout has been processed.

[Payout box - gold border]
  PAYOUT DETAILS
  Amount:                 {amount_formatted}
  Date:                   {payout_date}
  Period:                 {period_start} to {period_end}
  Transfer ID:            {stripe_transfer_id}

Funds should arrive in your connected bank account within
2 to 3 business days, depending on your bank.

Next expected payout: {next_payout_date}

[CTA: "View Payout History" -> dashboard_url]

[FOOTER]
```

**Render function signature:**

```python
def render_payout_processed(
    *,
    contact_name: str,
    amount_formatted: str,
    payout_date: str,
    period_start: str,
    period_end: str,
    stripe_transfer_id: str,
    next_payout_date: str,
    dashboard_url: str = "https://tiresias.network/dashboard/partner/billing",
) -> str:
```

---

### 3.8 PARTNER-EMAIL-08: Payout Failed

| Field | Value |
|---|---|
| **ID** | `PARTNER-EMAIL-08` |
| **Subject** | `Action required: Tiresias partner payout failed` |
| **Trigger** | Stripe Transfer fails (webhook: `transfer.failed`) |
| **Recipient** | Partner `contact_email` **AND** `partners@saluca.com` (admin) |
| **Tag** | `partner_payout_failed` |

**Template variables:**

| Variable | Type | Source |
|---|---|---|
| `contact_name` | str | Partner contact name |
| `company_name` | str | Partner company name |
| `amount_formatted` | str | e.g., "$1,247.00" |
| `failure_reason` | str | Stripe failure code/description |
| `stripe_transfer_id` | str | Failed transfer ID |
| `stripe_connect_url` | str | Link to update bank/payout details |

**Content outline (partner copy):**

```
[HEADER]

{contact_name},

A payout to your Tiresias partner account ({company_name}) has failed.

[Error box - red border (#ef4444)]
  PAYOUT FAILURE
  Amount:                 {amount_formatted}
  Transfer ID:            {stripe_transfer_id}
  Reason:                 {failure_reason}

This is most commonly caused by outdated or incorrect bank account
details in your Stripe Connect profile.

Action required:
  1. Review your connected bank account details
  2. Update or re-verify your payout method
  3. The payout will be retried automatically on the next cycle

[CTA: "Update Payout Details" -> stripe_connect_url]

If you need assistance, contact partners@saluca.com.

[FOOTER]
```

**Admin copy** (sent to `partners@saluca.com`): Same content with an additional header line: `"[ADMIN COPY] Payout failed for partner {company_name} ({partner_code})"`. Uses tag `partner_payout_failed_admin`.

**Render function signatures:**

```python
def render_payout_failed(
    *,
    contact_name: str,
    company_name: str,
    amount_formatted: str,
    failure_reason: str,
    stripe_transfer_id: str,
    stripe_connect_url: str,
) -> str:

def render_payout_failed_admin(
    *,
    company_name: str,
    partner_code: str,
    amount_formatted: str,
    failure_reason: str,
    stripe_transfer_id: str,
) -> str:
```

---

## 4. Trigger Functions

File: `src/partner/email_triggers.py`

All trigger functions follow the same pattern as `src/email/triggers.py`: async, non-fatal, logged. They import `send_email` from `src/email/sender` and render functions from `src/partner/email_templates`.

| Function | Calls Render | Sends To | Tag |
|---|---|---|---|
| `on_partner_approved(...)` | `render_partner_invitation` | `contact_email` | `partner_invitation` |
| `on_partner_onboarded(...)` | `render_partner_welcome` | `contact_email` | `partner_welcome` |
| `on_stripe_connect_reminder(...)` | `render_stripe_connect_reminder` | `contact_email` | `partner_stripe_reminder` |
| `on_partner_deactivated(...)` | `render_partner_deactivated` | `contact_email` | `partner_deactivated` |
| `on_partner_terms_updated(...)` | `render_partner_terms_updated` | `contact_email` | `partner_terms_updated` |
| `on_monthly_commission_report(...)` | `render_monthly_commission_report` | `contact_email` | `partner_monthly_report` |
| `on_payout_processed(...)` | `render_payout_processed` | `contact_email` | `partner_payout_processed` |
| `on_payout_failed(...)` | `render_payout_failed` + `render_payout_failed_admin` | `contact_email` + `partners@saluca.com` | `partner_payout_failed` |

### Trigger integration points

| Trigger Function | Called From | Location |
|---|---|---|
| `on_partner_approved` | `POST /v1/admin/partners/{id}/approve` handler | `src/partner/router.py` |
| `on_partner_onboarded` | Onboarding completion handler | `src/partner/router.py` |
| `on_stripe_connect_reminder` | Partner reminder cron (new) | `src/partner/cron.py` |
| `on_partner_deactivated` | `POST /v1/admin/partners/{id}/suspend` handler | `src/partner/router.py` |
| `on_partner_terms_updated` | `PUT /v1/admin/partners/{id}/config` handler | `src/partner/router.py` |
| `on_monthly_commission_report` | Monthly reconciliation cron | `src/partner/reconciliation.py` |
| `on_payout_processed` | Stripe `transfer.paid` webhook | `src/partner/webhooks.py` |
| `on_payout_failed` | Stripe `transfer.failed` webhook | `src/partner/webhooks.py` |

---

## 5. Slack Notifications

File: `src/partner/slack_notifications.py`

Uses a simple `httpx.AsyncClient.post()` to a Slack incoming webhook URL stored in `settings.partner_slack_webhook_url`. Non-fatal; failures are logged and swallowed.

### 5.1 Settings Addition

Add to `config/settings.py`:

```python
partner_slack_webhook_url: str = ""       # Slack #partner-ops incoming webhook
partner_admin_email: str = "partners@saluca.com"
```

### 5.2 Webhook Payloads

#### New Partner Onboarded

```json
{
  "text": ":handshake: New partner onboarded",
  "blocks": [
    {
      "type": "header",
      "text": {"type": "plain_text", "text": "New Partner Onboarded"}
    },
    {
      "type": "section",
      "fields": [
        {"type": "mrkdwn", "text": "*Company:*\n{company_name}"},
        {"type": "mrkdwn", "text": "*Type:*\n{partner_type}"},
        {"type": "mrkdwn", "text": "*Code:*\n{partner_code}"},
        {"type": "mrkdwn", "text": "*Contact:*\n{contact_email}"}
      ]
    }
  ]
}
```

#### Partner Deactivated

```json
{
  "text": ":warning: Partner deactivated: {company_name}",
  "blocks": [
    {
      "type": "header",
      "text": {"type": "plain_text", "text": "Partner Deactivated"}
    },
    {
      "type": "section",
      "fields": [
        {"type": "mrkdwn", "text": "*Company:*\n{company_name}"},
        {"type": "mrkdwn", "text": "*Code:*\n{partner_code}"},
        {"type": "mrkdwn", "text": "*Reason:*\n{reason}"},
        {"type": "mrkdwn", "text": "*Suspended at:*\n{suspended_at}"}
      ]
    }
  ]
}
```

#### Payout Failed

```json
{
  "text": ":rotating_light: Partner payout failed: {company_name}",
  "blocks": [
    {
      "type": "header",
      "text": {"type": "plain_text", "text": "Partner Payout Failed"}
    },
    {
      "type": "section",
      "fields": [
        {"type": "mrkdwn", "text": "*Company:*\n{company_name}"},
        {"type": "mrkdwn", "text": "*Amount:*\n{amount_formatted}"},
        {"type": "mrkdwn", "text": "*Reason:*\n{failure_reason}"},
        {"type": "mrkdwn", "text": "*Transfer ID:*\n{stripe_transfer_id}"}
      ]
    }
  ]
}
```

#### High-Value Referral (>$500 MRR)

```json
{
  "text": ":star2: High-value referral from {company_name}",
  "blocks": [
    {
      "type": "header",
      "text": {"type": "plain_text", "text": "High-Value Referral"}
    },
    {
      "type": "section",
      "fields": [
        {"type": "mrkdwn", "text": "*Partner:*\n{company_name} ({partner_code})"},
        {"type": "mrkdwn", "text": "*Referred Tenant:*\n{tenant_name}"},
        {"type": "mrkdwn", "text": "*Tier:*\n{tier}"},
        {"type": "mrkdwn", "text": "*MRR:*\n{mrr_formatted}"}
      ]
    }
  ]
}
```

### 5.3 Slack Sender Function

```python
async def send_partner_slack(
    *,
    payload: dict,
) -> bool:
    """Post a message to #partner-ops via incoming webhook. Non-fatal."""
    settings = get_settings()
    if not settings.partner_slack_webhook_url:
        logger.warning("partner.slack.skipped", reason="webhook URL not configured")
        return False

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                settings.partner_slack_webhook_url,
                json=payload,
                timeout=10.0,
            )
            resp.raise_for_status()
            logger.info("partner.slack.sent")
            return True
        except Exception as exc:
            logger.error("partner.slack.failed", error=str(exc))
            return False
```

### 5.4 Slack Integration Points

| Notification | Called From |
|---|---|
| New partner onboarded | `on_partner_onboarded` trigger (alongside email) |
| Partner deactivated | `on_partner_deactivated` trigger |
| Payout failed | `on_payout_failed` trigger |
| High-value referral | Tenant provisioning handler or referral attribution handler |

---

## 6. Implementation Approach

### 6.1 Import Strategy

Partner templates import shared layout from the existing email module:

```python
from src.email.templates import _HEADER, _FOOTER, _cta_button, _kv_row
```

This ensures brand consistency without duplicating HTML. If `_HEADER`/`_FOOTER` are refactored upstream, partner templates automatically pick up the changes.

### 6.2 Preview/Test Mode

Add a preview endpoint in the partner admin router for template development:

```python
# In src/partner/router.py (admin section)

@router.get("/v1/admin/partners/email-preview/{template_id}")
async def preview_partner_email(template_id: str):
    """
    Returns rendered HTML for a partner email template with dummy data.
    Admin-only. Useful for design review and testing.
    """
    previews = {
        "invitation": lambda: render_partner_invitation(
            contact_name="Jane Smith",
            company_name="Acme Security Inc.",
            partner_type="MSSP Partner",
            partner_code="ACME-SEC-2026",
            onboarding_url="https://tiresias.network/partners/onboard?token=preview-token",
            token_expires_at="April 13, 2026",
        ),
        # ... one per template with realistic dummy data
    }
    renderer = previews.get(template_id)
    if not renderer:
        raise HTTPException(404, f"Unknown template: {template_id}")
    return HTMLResponse(renderer())
```

### 6.3 Stripe Connect Reminder Cron

The 48-hour Stripe Connect reminder requires a cron entry. Add to `src/partner/cron.py`:

```python
async def check_stripe_connect_reminders():
    """
    Query _partners WHERE stripe_connect_account_id IS NULL
    AND approved_at < now() - interval '48 hours'
    AND no reminder email sent yet (track via _partner_audit_log).
    For each, fire on_stripe_connect_reminder().
    """
```

This cron runs daily (not every 48 hours) and queries for partners who crossed the 48-hour threshold since the last run. A record in `_partner_audit_log` with action `stripe_connect_reminder_sent` prevents duplicate sends.

### 6.4 Email Sending for Dual Recipients (Payout Failed)

The `on_payout_failed` trigger calls `send_email` twice: once for the partner, once for admin. Both are awaited independently so a failure on one does not block the other:

```python
async def on_payout_failed(...):
    partner_html = render_payout_failed(...)
    admin_html = render_payout_failed_admin(...)
    await asyncio.gather(
        send_email(to=contact_email, subject=..., html=partner_html, tag="partner_payout_failed"),
        send_email(to=admin_email, subject=..., html=admin_html, tag="partner_payout_failed_admin"),
        return_exceptions=True,
    )
```

---

## 7. Estimated Effort

| Task | Estimate | Notes |
|---|---|---|
| `src/partner/email_templates.py` (8 render functions + 1 admin variant) | 4 hours | Mostly HTML construction following established patterns |
| `src/partner/email_triggers.py` (8 trigger functions) | 2 hours | Thin wrappers around render + send |
| `src/partner/slack_notifications.py` (4 payloads + sender) | 1.5 hours | Straightforward webhook POSTs |
| Email preview endpoint | 1 hour | Admin-only, dummy data |
| Stripe Connect reminder cron logic | 1.5 hours | Query + dedup logic |
| Settings additions (`partner_slack_webhook_url`, `partner_admin_email`) | 0.5 hours | Two new env vars |
| Unit tests (template rendering, trigger mocks) | 3 hours | Mock `send_email`, assert HTML contains expected content |
| Integration test (preview endpoint) | 1 hour | HTTP test with admin auth |
| **Total** | **~14.5 hours** | ~2 days |

### Dependencies

| Dependency | Required For | Spec |
|---|---|---|
| Partner DB schema + models | All templates (need partner data to populate variables) | `01-partner-db-schema.md` |
| Partner router (approve/suspend/config endpoints) | Trigger integration points | `02-partner-router.md` |
| Stripe Connect integration | Payout processed/failed templates, Connect reminder | `03-stripe-connect.md` |
| Reconciliation cron | Monthly commission report trigger | `02-partner-router.md` |

Templates can be built and tested in isolation (via preview endpoint with dummy data) before the router and Stripe integrations are ready. Recommended build order: templates first, then triggers wired up as each upstream endpoint is completed.
