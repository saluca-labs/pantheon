---
phase: 16-trial-checkout
plan: "01"
subsystem: billing
tags: [stripe, checkout, webhooks, trial, billing, saas, provisioning]
dependency_graph:
  requires: []
  provides:
    - email-only Stripe Checkout Session creation (TRIAL-01)
    - auto-provision on checkout.session.completed (TRIAL-02)
    - invoice.paid and invoice.payment_failed handling (BILL-03)
    - trial expiry cron job (TRIAL-05)
    - GET /api/billing/session soulkey retrieval endpoint
  affects:
    - portal/src/app/api/billing/checkout/route.ts
    - portal/src/app/api/billing/webhook/route.ts
    - portal/src/app/api/billing/session/route.ts (new)
    - src/saas/billing.py
    - src/saas/trial_expiry.py (new)
tech_stack:
  added: []
  patterns:
    - Stripe Checkout Session with trial_period_days: 14
    - Stripe 2026-02-25 API invoice.parent.subscription_details.subscription path
    - Ephemeral raw_key in Stripe subscription metadata (cleared on first read)
    - SQLAlchemy async update pattern for metadata JSON blob mutation
key_files:
  created:
    - portal/src/app/api/billing/session/route.ts
    - src/saas/trial_expiry.py
  modified:
    - portal/src/app/api/billing/checkout/route.ts
    - portal/src/app/api/billing/webhook/route.ts
    - src/saas/billing.py
decisions:
  - "Stripe 2026-02-25 API: invoice subscription is at invoice.parent.subscription_details.subscription, not invoice.subscription"
  - "raw_key stored ephemerally in Stripe subscription metadata — cleared by /api/billing/session on first retrieval"
  - "trial_expiry.py uses get_db() not get_db_session() per actual connection.py exports"
  - "subscription.deleted now downgrades to community (corrected from old open tier)"
metrics:
  duration: ~25 minutes
  completed: 2026-03-21
  tasks_completed: 3
  files_changed: 5
---

# Phase 16 Plan 01: Trial & Checkout Backend Summary

**One-liner:** Stripe Checkout Session with email-only new-user flow, 14-day trial, invoice event handlers in JS + Python, and standalone trial expiry cron job.

## What Was Built

### Task 1: Email-only checkout route (TRIAL-01)
Updated `portal/src/app/api/billing/checkout/route.ts`:
- `tenant_id` and `soulkey` are now optional — new users can checkout with email only
- Added `enterprise` plan to the PLANS map with env-backed price IDs
- `customer_email` passed to Stripe when `email` is provided (reduces friction)
- Email stored in session `metadata.contact_email` for webhook consumption
- `success_url` updated to `/checkout/success` (TRIAL-03 page from 16-02)
- Added `trial_period_days: 14` to `subscription_data`
- Renamed free tier from `open` to `community` to match tier taxonomy

### Task 2: Webhook relay + session API (TRIAL-02, BILL-03)
Updated `portal/src/app/api/billing/webhook/route.ts`:
- Added `invoice.paid` case: logs receipt (customer, amount, subscription) and forwards to SoulAuth
- Added `customer.subscription.created` case (was missing from original)
- Added enterprise tier to `PRICE_TO_TIER` and `LOOKUP_KEY_TO_TIER`
- `checkout.session.completed` now stores `raw_key` + `soulkey_id` in Stripe subscription metadata (ephemeral)
- `subscription.deleted` corrected to downgrade to `community` (was `open`)
- `invoice.payment_failed` now forwards to SoulAuth (was a TODO)

New file `portal/src/app/api/billing/session/route.ts`:
- `GET /api/billing/session?session_id=X` — retrieves plan, tenant_id, soulkey from Stripe
- Expands the Checkout Session with subscription to get raw_key from metadata
- Clears `raw_key` from Stripe metadata after first retrieval (shown once only)

### Task 3: Python invoice handlers + trial expiry (BILL-03, TRIAL-05)
Updated `src/saas/billing.py`:
- Added `invoice.paid` handler: logs receipt, clears `payment_failed_at` / `payment_failed_count` from tenant metadata
- Added `invoice.payment_failed` handler: flags tenant with `payment_failed_at` timestamp and attempt count (grace period in Phase 17)
- Both handlers guard against `tenant is None` (customer lookup may fail for invoice events)

New file `src/saas/trial_expiry.py`:
- `expire_trials(db)` async function: queries all active non-community tenants
- Checks `metadata_.trial_expires_at <= now()` for expiry condition
- Downgrades tier to `community`, sets `data_retention_until = now() + 30 days`
- Sets `trial_expired_at` and `trial_downgraded_from` in metadata for audit trail
- Standalone entry point: `python -m src.saas.trial_expiry`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stripe 2026-02-25 API: invoice.subscription moved to parent path**
- **Found during:** Task 2 verification (TypeScript check)
- **Issue:** `Stripe.Invoice` in the 2026-02-25.clover API no longer has a top-level `.subscription` field; it moved to `invoice.parent.subscription_details.subscription`
- **Fix:** Updated `invoice.paid` case to use `invoice.parent?.subscription_details?.subscription` with correct type narrowing
- **Files modified:** `portal/src/app/api/billing/webhook/route.ts`
- **Commit:** 81f629a

**2. [Rule 3 - Blocking] get_db_session does not exist — correct name is get_db**
- **Found during:** Task 3 verification (Python import check)
- **Issue:** `trial_expiry.py` imported `get_db_session` from `src.database.connection` but the actual exported function is `get_db`
- **Fix:** Changed import to `from src.database.connection import get_db` and updated call site in `_main()`
- **Files modified:** `src/saas/trial_expiry.py`
- **Commit:** 81f629a

### Out-of-Scope Issues (Deferred)
Pre-existing TypeScript errors in `DashboardSidebar.tsx` (TS17000: JSX attributes) — unrelated to billing changes, not touched.

## Known Stubs

None. All implemented functionality is wired end-to-end:
- Checkout creates real Stripe Sessions
- Webhook provisions via real SoulAuth `/v1/saas/provision` endpoint
- Session API reads from real Stripe subscription metadata
- Python handlers update real SoulTenant records
- trial_expiry.py queries real database

## Self-Check: PASSED

All 5 files confirmed present on GCP. All 4 commits confirmed in git log:
- ff4e314: feat(16-01): email-only checkout flow + enterprise plan + 14-day trial
- 761688a: feat(16-01): webhook invoice.paid handler + session API for soulkey retrieval
- 5bf2fd7: feat(16-01): Python invoice event handlers + trial expiry cron job
- 81f629a: fix(16-01): Stripe 2026-02-25 invoice.subscription path + correct db import
