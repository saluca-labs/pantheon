# 01 - Stripe Partner Configuration

**Status:** Ready for Implementation
**Author:** Saluca Engineering
**Date:** 2026-04-06
**Scope:** Stripe configuration and operational setup only. No modifications to existing source files.

---

## Objective

Configure Stripe Products, Prices, Connect accounts, and webhook routing to support the Tiresias Partner Program (MSSP and Reseller channels). This spec covers the operational/config work required before any application code is written. All code artifacts described here are isolated new files; nothing in the existing codebase is modified.

### Reference Documents

| Document | Path | Relevance |
|----------|------|-----------|
| Partner Program Spec | `Z:/tiresias/docs/PARTNER_PROGRAM_SPEC.md` | Billing models, rev-share, tier constraints |
| Pricing Quick Reference | `Z:/tiresias/sales/05-pricing-reference.md` | Canonical MSSP pricing ($4,999/mo + $199/tenant) |
| Pricing Policy | `Z:/saluca-corp/PRICING_POLICY.md` | Source of truth for all pricing; Stripe IDs for existing products |
| Existing Connect code | `Z:/tiresias/src/partner/connect.py` | Express account creation, onboarding links, status checks |
| Existing commission code | `Z:/tiresias/src/partner/commissions.py` | Cascading 60/40 split, transfer execution |
| Existing promo code logic | `Z:/tiresias/src/partner/promo.py` | Partner coupon and promo code creation |

### Existing Stripe Products (Do Not Touch)

These are live in production and must not be modified:

| Product | Stripe Product ID | Prices |
|---------|-------------------|--------|
| Tiresias Starter | `prod_UBjwIJ3zEmUZMC` | `price_1TDMSlBkXMYmrc2L29W09pQl` (monthly $49), `price_1TDMSlBkXMYmrc2LuuaUN5Cp` (annual $488) |
| Tiresias Pro | `prod_UBjwARRO3Bd46f` | `price_1TDMT2BkXMYmrc2Lhf1whQpi` (monthly $199), `price_1TDMT2BkXMYmrc2LnBUoJEww` (annual $1,982) |

---

## 1. Stripe Products to Create

### 1.1 MSSP Partner Base Subscription

This is the base platform fee for MSSP partners. Covers the partner's own MSSP-tier tenant, white-label branding, tenant provisioning API access, and cross-tenant views.

**Stripe Dashboard: Products > + Add product**

```
Name:           Tiresias MSSP Partner
Description:    MSSP Partner base subscription. Includes multi-tenant hierarchy,
                white-label branding, tenant provisioning API, and cross-tenant
                detection views. Per-tenant add-on billed separately.
Statement Descriptor: TIRESIAS MSSP
Tax Code:       txcd_10103001 (Software as a Service)
Unit Label:     (leave blank)
Metadata:
  tier:              mssp
  product_line:      tiresias
  partner_eligible:  true
  billing_model:     partner_billed
```

**Price Objects:**

| Price | Type | Amount | Interval | Lookup Key | Notes |
|-------|------|--------|----------|------------|-------|
| MSSP Monthly | Recurring, Licensed | $4,999.00 | Monthly | `tiresias_mssp_partner_monthly` | Standard monthly billing |
| MSSP Annual | Recurring, Licensed | $49,999.00 | Yearly | `tiresias_mssp_partner_annual` | ~17% discount ($4,166.58/mo effective) |

**Price Metadata (both prices):**

```
tier:              mssp
product_line:      tiresias
partner_eligible:  true
includes:          base_platform
```

### 1.2 Per-Tenant Add-on (Metered)

This is the per-tenant usage charge billed on top of the MSSP Partner base. Each sub-tenant provisioned by the partner counts as one unit. Aligned with the Partner Program Spec Model A (partner-billed).

**Stripe Dashboard: Products > + Add product**

```
Name:           Tiresias MSSP Per-Tenant Add-on
Description:    Per-tenant metered billing for MSSP partners. Each active
                sub-tenant provisioned under the partner counts as one unit.
                Billed monthly in arrears based on reported usage.
Statement Descriptor: TIRESIAS TENANT
Tax Code:       txcd_10103001 (Software as a Service)
Unit Label:     tenant
Metadata:
  tier:              mssp
  product_line:      tiresias
  partner_eligible:  true
  billing_model:     metered
  usage_type:        tenant_count
```

**Price Object:**

| Price | Type | Amount | Interval | Lookup Key | Notes |
|-------|------|--------|----------|------------|-------|
| Per-Tenant Monthly | Recurring, Metered | $199.00 per unit | Monthly | `tiresias_mssp_per_tenant` | Usage reported via Usage Records API |

**Metered Price Configuration:**

```
Billing scheme:    per_unit
Usage type:        metered
Aggregate usage:   last_during_period
                   (report current tenant count; Stripe uses the last-reported value)
```

**Price Metadata:**

```
tier:              mssp
product_line:      tiresias
partner_eligible:  true
unit_type:         tenant
per_unit_amount:   19900
```

### 1.3 Product Creation Checklist

Execute in Stripe Dashboard (Test Mode first, then Live):

- [ ] Create "Tiresias MSSP Partner" product with all metadata
- [ ] Add Monthly price ($4,999) with lookup key `tiresias_mssp_partner_monthly`
- [ ] Add Annual price ($49,999) with lookup key `tiresias_mssp_partner_annual`
- [ ] Create "Tiresias MSSP Per-Tenant Add-on" product with all metadata
- [ ] Add Metered price ($199/unit) with lookup key `tiresias_mssp_per_tenant`
- [ ] Verify all lookup keys resolve correctly via `stripe prices list --lookup-keys`
- [ ] Record all Product IDs and Price IDs in environment variables (Section 5)

---

## 2. Stripe Connect Configuration

The existing code in `src/partner/connect.py` creates Express accounts with `card_payments` and `transfers` capabilities. This section defines the platform-level Connect settings that must be configured in the Stripe Dashboard and the operational parameters that govern partner payouts.

### 2.1 Platform Settings (Stripe Dashboard > Connect > Settings)

```
Account type:                     Express
Business type (default):          company
Country support:                  US (Phase 1), expand to CA/GB/AU in Phase 2
Branding:
  Business name:                  Tiresias by Saluca LLC
  Icon:                           Tiresias logo (upload)
  Brand color:                    #1a1a2e (Saluca brand)
Onboarding:
  Return URL:                     https://tiresias.network/partner/onboard/complete
  Refresh URL:                    https://tiresias.network/partner/onboard/refresh
Payouts:
  Default schedule:               manual (platform-controlled)
```

### 2.2 Capability Requirements

Each partner Connect account must have these capabilities enabled before payouts can be processed:

| Capability | Required | Purpose |
|------------|----------|---------|
| `transfers` | Yes | Receive commission transfers from platform |
| `card_payments` | No (Phase 1) | Only needed if partner collects payments directly (Phase 2 Model B) |

The existing `create_connect_account()` in `connect.py` requests both `card_payments` and `transfers`. For Phase 1 (partner-billed model), only `transfers` is strictly necessary. However, requesting both up front avoids re-onboarding partners when Model B (direct-billed) is enabled in Phase 2.

### 2.3 Platform Fee Structure

The commission engine in `commissions.py` implements a 60/40 default split (platform 60%, partner 40%). The Partner Program Spec defines a configurable `revshare_pct` (default 25%, range 10-40%). These two numbers serve different purposes:

| Context | Split | Mechanism |
|---------|-------|-----------|
| **Model A (Partner-Billed, Phase 1)** | No split needed. Partner pays Saluca the full subscription ($4,999 + $199/tenant). Partner sets their own prices to end customers. | Standard subscription billing. No `application_fee`. |
| **Model B (Direct Rev-Share, Phase 2)** | Platform keeps (100 - revshare_pct)%. Partner receives revshare_pct%. Default: 75/25. | Stripe Connect Transfers executed monthly by reconciliation cron. |
| **Cascading (Recruiter Override, Phase 2)** | Platform 60%, Seller (40 - override)%, Recruiter override%. | Separate transfers per `commissions.py` `execute_transfers()`. `application_fee_percent` is NOT used; instead, platform collects full charge and issues explicit transfers. |

**Why explicit transfers instead of `application_fee_percent`:**
The cascading commission model (seller + recruiter) requires splitting the partner share between two Connect accounts. Stripe's `application_fee_percent` only supports a single platform fee, so explicit transfers via the Transfers API are the correct approach. This is already implemented in `commissions.py`.

### 2.4 Transfer Schedule

| Partner Status | Payout Timing | Rationale |
|----------------|---------------|-----------|
| New partner (< 90 days) | T+7 after transfer created | Chargeback window protection |
| Established partner (>= 90 days) | T+2 after transfer created | Reduced risk, faster partner cash flow |
| Flagged/disputed partner | Manual hold | Admin must release |

**Implementation:** Payout schedules are set per Connect account via the Stripe API:

```
# New partner (set at account creation time)
stripe accounts update {account_id} \
  --settings.payouts.schedule.delay_days=7

# After 90-day graduation (admin-triggered or automated)
stripe accounts update {account_id} \
  --settings.payouts.schedule.delay_days=2
```

A scheduled job should check partner age daily and graduate eligible accounts:

```
For each partner where:
  - status = 'active'
  - approved_at <= (now - 90 days)
  - stripe payout delay > 2
Update payout schedule to delay_days=2
Log graduation to _partner_audit_log
```

### 2.5 Connect Onboarding Flow

The existing `create_onboarding_link()` in `connect.py` generates the Express onboarding URL. The operational flow is:

```
1. Admin approves partner application (POST /v1/admin/partners/{id}/approve)
2. System calls create_connect_account() with partner metadata
3. System calls create_onboarding_link() to generate KYC/tax onboarding URL
4. Welcome email includes the onboarding URL
5. Partner completes Stripe onboarding (KYC, bank account, tax forms)
6. Stripe fires account.updated webhook
7. System checks charges_enabled + payouts_enabled via get_account_status()
8. If both true: partner status updated to 'connect_active'
9. If requirements still due: system sends reminder email at 24h, 72h, 7d
```

---

## 3. Webhook Endpoints to Register

### 3.1 Webhook Endpoint Configuration

Register two webhook endpoints in the Stripe Dashboard (Settings > Webhooks):

**Endpoint 1: Platform Events (existing)**

```
URL:        https://api.tiresias.network/v1/stripe/webhooks
Events:     (existing customer/subscription events for direct billing)
Secret:     STRIPE_WEBHOOK_SECRET (existing)
```

**Endpoint 2: Partner/Connect Events (new)**

```
URL:        https://api.tiresias.network/v1/stripe/partner-webhooks
Events:     (partner-specific events listed below)
Secret:     STRIPE_PARTNER_WEBHOOK_SECRET (new)
API Version: 2025-12-18.acacia (pin to current)
Connect:    Listen to events on Connected accounts (enable "Connect" toggle)
```

### 3.2 Required Event Types

| Event Type | Category | Handler | Purpose |
|------------|----------|---------|---------|
| `account.updated` | Connect | `handle_connect_account_updated` | Detect onboarding completion, capability changes, account deactivation |
| `account.application.deauthorized` | Connect | `handle_connect_deauthorized` | Partner disconnected their Stripe account from the platform |
| `invoice.paid` | Billing | `handle_partner_invoice_paid` | Confirm partner subscription payment; trigger metered usage reset |
| `invoice.payment_failed` | Billing | `handle_partner_invoice_failed` | Flag partner account; send dunning notification; suspend after 3 failures |
| `invoice.finalized` | Billing | `handle_partner_invoice_finalized` | Record invoice line items for reconciliation audit trail |
| `customer.subscription.updated` | Billing | `handle_partner_subscription_updated` | Detect tier changes, cancellation scheduling, plan switches |
| `customer.subscription.deleted` | Billing | `handle_partner_subscription_deleted` | Partner churned; trigger sub-tenant wind-down process |
| `transfer.created` | Payouts | `handle_transfer_created` | Log successful commission transfer to partner |
| `transfer.failed` | Payouts | `handle_transfer_failed` | Alert ops; mark payout ledger entry as failed; retry logic |
| `payout.paid` | Payouts | `handle_payout_paid` | Confirm funds reached partner's bank account |
| `payout.failed` | Payouts | `handle_payout_failed` | Alert ops; investigate bank account issues; notify partner |
| `charge.dispute.created` | Risk | `handle_dispute_created` | Flag partner; hold pending payouts; investigate |
| `charge.dispute.closed` | Risk | `handle_dispute_closed` | Release holds if resolved in platform's favor |

### 3.3 Webhook Handler Routing

New file: `src/partner/webhooks.py` (isolated; does not modify existing `src/saas/billing.py`)

```
Request flow:
  POST /v1/stripe/partner-webhooks
    -> verify signature (STRIPE_PARTNER_WEBHOOK_SECRET)
    -> parse event type
    -> route to handler based on event_type_map:

EVENT_HANDLER_MAP = {
    "account.updated":                      handle_connect_account_updated,
    "account.application.deauthorized":     handle_connect_deauthorized,
    "invoice.paid":                         handle_partner_invoice_paid,
    "invoice.payment_failed":               handle_partner_invoice_failed,
    "invoice.finalized":                    handle_partner_invoice_finalized,
    "customer.subscription.updated":        handle_partner_subscription_updated,
    "customer.subscription.deleted":        handle_partner_subscription_deleted,
    "transfer.created":                     handle_transfer_created,
    "transfer.failed":                      handle_transfer_failed,
    "payout.paid":                          handle_payout_paid,
    "payout.failed":                        handle_payout_failed,
    "charge.dispute.created":               handle_dispute_created,
    "charge.dispute.closed":                handle_dispute_closed,
}
```

### 3.4 Idempotency Requirements

Every webhook handler MUST be idempotent. Stripe may deliver the same event multiple times.

**Implementation pattern:**

1. **Event deduplication table:** `_stripe_webhook_events` with columns `event_id` (Stripe event ID, unique), `event_type`, `processed_at`, `result`. Before processing, check if `event_id` exists. If it does, return 200 immediately without re-processing.
2. **Database transactions:** All state changes within a handler must be wrapped in a single database transaction. If any step fails, the entire handler rolls back, and the event can be retried.
3. **Idempotency key for outbound calls:** When a handler triggers an outbound Stripe API call (e.g., creating a transfer), use `Idempotency-Key: {event_id}_{action}` to prevent duplicate side effects.

```sql
CREATE TABLE _stripe_webhook_events (
    event_id        VARCHAR(255) PRIMARY KEY,  -- e.g., evt_1abc2def3ghi
    event_type      VARCHAR(100) NOT NULL,
    account_id      VARCHAR(255),              -- Connect account if applicable
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    result          VARCHAR(20) NOT NULL DEFAULT 'ok'
                        CHECK (result IN ('ok', 'skipped', 'failed')),
    error_message   TEXT
);

CREATE INDEX idx_webhook_events_type ON _stripe_webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed ON _stripe_webhook_events(processed_at);
```

### 3.5 Webhook Security

- **Signature verification:** Every incoming request must be verified using Stripe's webhook signing secret. Use `stripe.Webhook.construct_event()` or manual HMAC-SHA256 verification.
- **IP allowlisting (optional but recommended):** Stripe publishes its webhook IPs. Consider allowlisting at the load balancer level for defense in depth.
- **Timeout:** Respond within 5 seconds. If processing takes longer, queue the event and return 200 immediately.
- **Retry policy:** Stripe retries failed deliveries (non-2xx responses) with exponential backoff for up to 3 days. The idempotency table ensures retries are safe.

---

## 4. Stripe CLI / API Commands for Product Setup

These commands create the products and prices in Stripe Test Mode. Run them via the Stripe CLI or Dashboard.

### 4.1 Create MSSP Partner Product

```bash
stripe products create \
  --name="Tiresias MSSP Partner" \
  --description="MSSP Partner base subscription. Includes multi-tenant hierarchy, white-label branding, tenant provisioning API, and cross-tenant detection views." \
  --statement-descriptor="TIRESIAS MSSP" \
  --tax-code="txcd_10103001" \
  -d "metadata[tier]=mssp" \
  -d "metadata[product_line]=tiresias" \
  -d "metadata[partner_eligible]=true" \
  -d "metadata[billing_model]=partner_billed"
```

Record the returned `prod_xxxxx` ID.

### 4.2 Create MSSP Monthly Price

```bash
stripe prices create \
  --product="{MSSP_PRODUCT_ID}" \
  --unit-amount=499900 \
  --currency=usd \
  --recurring-interval=month \
  --lookup-key="tiresias_mssp_partner_monthly" \
  -d "metadata[tier]=mssp" \
  -d "metadata[product_line]=tiresias" \
  -d "metadata[partner_eligible]=true" \
  -d "metadata[includes]=base_platform"
```

### 4.3 Create MSSP Annual Price

```bash
stripe prices create \
  --product="{MSSP_PRODUCT_ID}" \
  --unit-amount=4999900 \
  --currency=usd \
  --recurring-interval=year \
  --lookup-key="tiresias_mssp_partner_annual" \
  -d "metadata[tier]=mssp" \
  -d "metadata[product_line]=tiresias" \
  -d "metadata[partner_eligible]=true" \
  -d "metadata[includes]=base_platform"
```

### 4.4 Create Per-Tenant Add-on Product

```bash
stripe products create \
  --name="Tiresias MSSP Per-Tenant Add-on" \
  --description="Per-tenant metered billing for MSSP partners. Each active sub-tenant counts as one unit." \
  --statement-descriptor="TIRESIAS TENANT" \
  --unit-label="tenant" \
  --tax-code="txcd_10103001" \
  -d "metadata[tier]=mssp" \
  -d "metadata[product_line]=tiresias" \
  -d "metadata[partner_eligible]=true" \
  -d "metadata[billing_model]=metered" \
  -d "metadata[usage_type]=tenant_count"
```

### 4.5 Create Per-Tenant Metered Price

```bash
stripe prices create \
  --product="{TENANT_ADDON_PRODUCT_ID}" \
  --unit-amount=19900 \
  --currency=usd \
  --recurring-interval=month \
  --recurring-usage-type=metered \
  --recurring-aggregate-usage=last_during_period \
  --lookup-key="tiresias_mssp_per_tenant" \
  -d "metadata[tier]=mssp" \
  -d "metadata[product_line]=tiresias" \
  -d "metadata[partner_eligible]=true" \
  -d "metadata[unit_type]=tenant"
```

---

## 5. Environment Variables

### 5.1 New Variables Required

| Variable | Example Value | Purpose | Where Stored |
|----------|---------------|---------|--------------|
| `STRIPE_PARTNER_PRODUCT_MSSP` | `prod_xxxxxxxxx` | MSSP Partner product ID | GCP Secret Manager + `.env` |
| `STRIPE_PARTNER_PRODUCT_TENANT_ADDON` | `prod_xxxxxxxxx` | Per-Tenant Add-on product ID | GCP Secret Manager + `.env` |
| `STRIPE_PARTNER_PRICE_MSSP_MONTHLY` | `price_xxxxxxxxx` | MSSP monthly price ID | GCP Secret Manager + `.env` |
| `STRIPE_PARTNER_PRICE_MSSP_ANNUAL` | `price_xxxxxxxxx` | MSSP annual price ID | GCP Secret Manager + `.env` |
| `STRIPE_PARTNER_PRICE_PER_TENANT` | `price_xxxxxxxxx` | Per-tenant metered price ID | GCP Secret Manager + `.env` |
| `STRIPE_PARTNER_WEBHOOK_SECRET` | `whsec_xxxxxxxxx` | Webhook signing secret for partner endpoint | GCP Secret Manager + `.env` |
| `STRIPE_CONNECT_ONBOARD_RETURN_URL` | `https://tiresias.network/partner/onboard/complete` | Connect onboarding return URL | `.env` |
| `STRIPE_CONNECT_ONBOARD_REFRESH_URL` | `https://tiresias.network/partner/onboard/refresh` | Connect onboarding refresh URL | `.env` |
| `STRIPE_PARTNER_PAYOUT_DELAY_NEW` | `7` | Payout delay in days for new partners | `.env` |
| `STRIPE_PARTNER_PAYOUT_DELAY_GRADUATED` | `2` | Payout delay in days after 90-day graduation | `.env` |

### 5.2 Existing Variables (Already in Use)

These are already configured and must NOT be duplicated or overwritten:

| Variable | Purpose | Used By |
|----------|---------|---------|
| `STRIPE_SECRET_KEY` | Platform API key (used by `connect.py`, `commissions.py`, `promo.py`, `billing.py`) | All Stripe modules |
| `STRIPE_WEBHOOK_SECRET` | Existing webhook signing secret | `src/saas/billing.py` |
| `STRIPE_PUBLISHABLE_KEY` | Frontend checkout | Portal |

### 5.3 Secret Management Protocol

1. **Development/Test:** Store in `.env` file (git-ignored). Use Stripe Test Mode keys (`sk_test_`, `whsec_test_`).
2. **Staging:** GCP Secret Manager, project `salucainfrastructure`. Secret names follow pattern `tiresias-stripe-partner-{name}`.
3. **Production:** GCP Secret Manager, same project. Rotated quarterly. Access via workload identity on Cloud Run.
4. **Never commit** Stripe keys, webhook secrets, or Connect credentials to version control.

---

## 6. Testing Checklist

### 6.1 Stripe Test Mode Validation

All testing must be performed in Stripe Test Mode before any live configuration.

**Product/Price Verification:**

- [ ] MSSP Partner product exists in Test Mode with correct metadata
- [ ] MSSP Monthly price resolves via lookup key `tiresias_mssp_partner_monthly`
- [ ] MSSP Annual price resolves via lookup key `tiresias_mssp_partner_annual`
- [ ] Per-Tenant Add-on product exists with `unit_label: tenant`
- [ ] Per-Tenant metered price resolves via lookup key `tiresias_mssp_per_tenant`
- [ ] Metered price aggregate usage is `last_during_period`
- [ ] All products have correct `tier`, `product_line`, `partner_eligible` metadata

**Connect Account Verification:**

- [ ] Can create Express account via `create_connect_account()`
- [ ] Onboarding link redirects to Stripe Express onboarding flow
- [ ] After completing test onboarding, `charges_enabled` and `payouts_enabled` are true
- [ ] Dashboard login link works for the Express account
- [ ] Payout schedule defaults to `delay_days: 7`

### 6.2 End-to-End Flow Test

Execute this sequence in Test Mode. Each step must pass before proceeding to the next.

```
Step 1: Create Connect Account
  Input:  partner_name="Test MSSP Corp", contact_email="test@example.com", partner_id="test-001"
  Verify: account_id returned, status=pending
  Verify: account.updated webhook fires

Step 2: Complete Onboarding
  Input:  Use Stripe test onboarding flow (test data auto-fills)
  Verify: account.updated webhook fires with charges_enabled=true, payouts_enabled=true
  Verify: get_account_status() returns both enabled

Step 3: Subscribe Partner
  Input:  Create subscription with MSSP Monthly price + Per-Tenant metered price
  Verify: Subscription status=active
  Verify: invoice.finalized webhook fires
  Verify: invoice.paid webhook fires (test card auto-pays)

Step 4: Report Tenant Usage
  Input:  Report usage_record with quantity=5 (5 tenants) on the metered subscription item
  Verify: Next invoice includes $4,999 (base) + $995 (5 x $199) = $5,994

Step 5: Calculate Commission (Model B prep)
  Input:  Call calculate_split() with test partner
  Verify: Returns correct platform_rate and seller_rate per revshare_pct
  Verify: If cascading, recruiter_rate is correct

Step 6: Execute Transfer
  Input:  Call execute_transfers() with test charge and split
  Verify: transfer.created webhook fires
  Verify: Transfer amount matches expected commission
  Verify: transfer_group metadata is correct

Step 7: Verify Payout
  Input:  Trigger payout on connected account (or wait for scheduled payout in test mode)
  Verify: payout.paid webhook fires
  Verify: Payout amount matches transfer minus Stripe fees
```

### 6.3 Edge Cases

| # | Scenario | Test Method | Expected Behavior |
|---|----------|-------------|-------------------|
| 1 | **Failed payment** | Use Stripe test card `4000000000000341` (attach_fail) | `invoice.payment_failed` fires. Partner flagged. Dunning email sent. After 3 failures, subscription paused. |
| 2 | **Disputed charge** | Create dispute via Stripe Dashboard on a test charge | `charge.dispute.created` fires. Partner payouts held. Alert to #partner-ops. |
| 3 | **Connect account deactivated** | Deactivate account via Stripe Dashboard | `account.updated` fires with `charges_enabled=false`. Partner status set to `suspended`. No new transfers. |
| 4 | **Connect account deauthorized** | Revoke platform access from connected account | `account.application.deauthorized` fires. Partner marked as `connect_disconnected`. Requires re-onboarding. |
| 5 | **Transfer to deactivated account** | Attempt transfer to suspended Connect account | Transfer fails. `transfer.failed` fires. Payout ledger entry marked `failed`. Ops alerted. |
| 6 | **Metered usage reported as 0** | Report usage_record quantity=0 | Invoice only includes base fee ($4,999). No per-tenant charge. |
| 7 | **Duplicate webhook delivery** | Replay event via Stripe CLI `stripe events resend` | Idempotency table catches duplicate. Handler returns 200 without re-processing. |
| 8 | **Subscription downgrade** | Switch from Annual to Monthly mid-cycle | `customer.subscription.updated` fires. Prorated credit applied by Stripe. |
| 9 | **Partner cancels subscription** | Cancel subscription via API or Dashboard | `customer.subscription.deleted` fires. Sub-tenant wind-down process initiated (grace period, notifications). |
| 10 | **Webhook signature mismatch** | Send request with wrong secret | 400 returned. Event not processed. Logged as security alert. |

### 6.4 Stripe CLI Test Commands

```bash
# Listen to partner webhook events locally
stripe listen --forward-to localhost:8000/v1/stripe/partner-webhooks \
  --events account.updated,invoice.paid,invoice.payment_failed,\
customer.subscription.updated,customer.subscription.deleted,\
transfer.created,transfer.failed,payout.paid,payout.failed,\
charge.dispute.created,charge.dispute.closed

# Trigger test events
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.updated
stripe trigger charge.dispute.created

# Resend a specific event (idempotency test)
stripe events resend evt_xxxxx
```

---

## 7. Estimated Effort

### 7.1 Task Breakdown

| # | Task | Estimate | Dependencies | Owner |
|---|------|----------|-------------|-------|
| 1 | Create Stripe products and prices (Test Mode) | 1 hour | None | Ops/Engineering |
| 2 | Configure Connect platform settings in Dashboard | 30 min | None | Ops/Engineering |
| 3 | Register partner webhook endpoint in Dashboard | 15 min | None | Ops/Engineering |
| 4 | Set up environment variables (dev + staging) | 30 min | Tasks 1, 3 (need IDs and secrets) | Ops/Engineering |
| 5 | Create `_stripe_webhook_events` dedup table migration | 1 hour | None | Engineering |
| 6 | Implement `src/partner/webhooks.py` (new file, handler routing + idempotency) | 4 hours | Tasks 3, 5 | Engineering |
| 7 | Implement Connect event handlers (`account.updated`, deauthorized) | 2 hours | Task 6 | Engineering |
| 8 | Implement billing event handlers (invoice.paid, failed, subscription events) | 3 hours | Task 6 | Engineering |
| 9 | Implement payout event handlers (transfer.created/failed, payout.paid/failed) | 2 hours | Task 6 | Engineering |
| 10 | Implement dispute handlers | 1 hour | Task 6 | Engineering |
| 11 | Implement payout schedule graduation job | 2 hours | Task 2 | Engineering |
| 12 | End-to-end test in Stripe Test Mode | 3 hours | Tasks 1-10 | Engineering |
| 13 | Replicate products/prices to Stripe Live Mode | 1 hour | Task 12 passes | Ops (with admin) |
| 14 | Deploy webhook endpoint to staging | 1 hour | Tasks 6-10, staging env vars | Engineering |
| 15 | Staging integration test | 2 hours | Tasks 13, 14 | Engineering |

**Total estimated effort: ~24 hours (~3 engineering days)**

### 7.2 Dependency Graph

```
                    [1. Create Products]
                           |
                    [4. Set Env Vars] ----+
                           |              |
[2. Connect Settings]      |              |
         |                 |              |
[3. Register Webhooks]     |              |
         |                 |              |
    [5. Dedup Table]       |              |
         |                 |              |
    [6. Webhook Router] ---+              |
       / | \  \                           |
     [7] [8] [9] [10]                    |
       \ | /  /                           |
    [11. Graduation Job]                  |
         |                                |
    [12. E2E Test] -----------------------+
         |
    [13. Live Products]
         |
    [14. Deploy Staging]
         |
    [15. Staging Test]
```

Tasks 1, 2, 3, and 5 can all run in parallel. Tasks 7-10 can run in parallel after task 6.

### 7.3 Risk Factors

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Stripe metered billing `last_during_period` does not match expected behavior for tenant count tracking | Billing accuracy | Low | Test thoroughly with multiple usage reports in a single period. If problematic, switch to `sum` aggregate with delta-based reporting. |
| Connect Express onboarding has country-specific requirements that block non-US partners | Partner onboarding friction | Medium | Phase 1 is US-only. Document country expansion as Phase 2 work. |
| Webhook delivery delays during Stripe incidents cause stale partner status | Data consistency | Low | Reconciliation cron job (already specified in Partner Program Spec) catches drift. Add health check that compares Stripe account status with local DB. |
| Payout schedule graduation logic runs on a partner who has open disputes | Financial risk | Medium | Graduation job must check for open disputes and skip flagged partners. |
| Existing `src/saas/billing.py` webhook handler and new `src/partner/webhooks.py` both receive overlapping event types | Double-processing | Medium | Use separate webhook endpoints (different URLs, different secrets). Filter by subscription metadata (`partner_eligible: true`) in partner handler; ignore events without that metadata. |
| Product/price IDs differ between Test and Live modes | Deployment confusion | Low | Use lookup keys (`tiresias_mssp_partner_monthly`, etc.) instead of hardcoded price IDs wherever possible. Lookup keys are consistent across modes. |

---

## 8. Files Created by This Spec

All new files. No existing files modified.

| File | Type | Purpose |
|------|------|---------|
| `src/partner/webhooks.py` | Python | Webhook handler routing, signature verification, idempotency |
| `migrations/xxx_create_stripe_webhook_events.sql` | SQL | Idempotency deduplication table |
| `.env.partner.example` | Config | Template for partner-specific environment variables |

---

## Appendix A: Metadata Taxonomy

All partner Stripe objects use consistent metadata keys for filtering and attribution:

| Key | Values | Applied To | Purpose |
|-----|--------|------------|---------|
| `tier` | `mssp` | Products, Prices, Subscriptions | Tier identification |
| `product_line` | `tiresias` | Products, Prices | Product line grouping |
| `partner_eligible` | `true` | Products, Prices | Marks partner-specific objects |
| `billing_model` | `partner_billed`, `metered` | Products | Billing model identification |
| `partner_id` | UUID | Subscriptions, Invoices, Transfers | Partner attribution |
| `partner_name` | String | Connect Accounts | Human-readable partner name |
| `usage_type` | `tenant_count` | Metered Products | Usage metric type |
| `unit_type` | `tenant` | Metered Prices | Unit label for invoices |
| `type` | `seller_commission`, `recruiter_override` | Transfers | Commission type for reconciliation |

## Appendix B: Lookup Key Reference

Lookup keys provide stable references that work across Test and Live modes:

| Lookup Key | Object | Amount |
|------------|--------|--------|
| `tiresias_starter_monthly` | Existing Price | $49/mo |
| `tiresias_starter_annual` | Existing Price | $488/yr |
| `tiresias_pro_monthly` | Existing Price | $199/mo |
| `tiresias_pro_annual` | Existing Price | $1,982/yr |
| `tiresias_mssp_partner_monthly` | New Price | $4,999/mo |
| `tiresias_mssp_partner_annual` | New Price | $49,999/yr |
| `tiresias_mssp_per_tenant` | New Price (metered) | $199/unit/mo |
