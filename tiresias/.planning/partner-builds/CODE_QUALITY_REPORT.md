# Partner Program Code Quality Report

**Date:** 2026-04-06
**Scope:** 14 source modules, 3 migrations, 4 test files
**Reviewer:** Alfred (automated assessment)

---

## Summary

| Rating | Count |
|--------|-------|
| PASS | 11 |
| MINOR ISSUE | 7 |
| NEEDS FIX | 3 |

**Overall Readiness: Needs Work** (3 files have signature mismatches that will cause ImportError or TypeError at runtime)

---

## File-by-File Assessment

### 1. src/partner/types.py -- PASS

Clean module. Enum values correct, capability matrix complete for all 13 capabilities, both partner types covered in all lookup dicts. `has_capability()` handles unknown capabilities gracefully.

No issues.

---

### 2. src/partner/type_guard.py -- PASS

- DB queries use parameterized SQLAlchemy `select()`, no injection risk.
- Proper async/await on all DB calls.
- HTTPException details are structured dicts (403) which is fine for FastAPI.
- `get_partner_or_none` gracefully returns None on any ValueError.
- Uses `Optional` from typing (consistent with codebase).

No issues.

---

### 3. src/partner/tier_constants.py -- PASS

- `frozenset` for immutable tier sets is correct.
- `OrderedDict` for tier hierarchy preserves insertion order (though regular dict would also work in Python 3.7+, this is fine for explicitness).
- All validation functions handle empty/None inputs.
- `validate_tier_upgrade` correctly checks both rank existence and direction.

No issues.

---

### 4. src/partner/tier_enforcement.py -- PASS

- Feature flag pattern (`enforce`/`monitor`/`disabled`) is well-implemented.
- Partner context resolution walks up to grandparent level (depth 2), which covers the MAX_HIERARCHY_DEPTH=1 constraint.
- Request body caching on `request.state._tier_guard_body` prevents double-consume of the stream.
- Audit logging is wrapped in try/except so it never crashes the request.
- `validate_tier_for_subtenant()` standalone function correctly handles empty parent_tenant_id.

No issues.

---

### 5. src/partner/webhooks.py -- MINOR ISSUE

**Assessment:** Solid webhook handler with good patterns.

**Issues:**

- **Line 103:** `hmac.new()` should be `hmac.HMAC()`. The `hmac` module does not have a `new` function in the standard library; the correct call is `hmac.new(...)` which IS valid (it is actually `hmac.new`). Verified: `hmac.new` is a valid alias. No issue.

- **Lines 207-219 (`_find_partner_by_customer_id`):** Uses raw SQL with PostgreSQL-specific JSON operator `metadata_->>'stripe_customer_id'`. This will fail on SQLite (tests). However, since this is only called in webhook handlers that run in production, and tests mock at a higher level, this is acceptable but worth noting.

- **Lines 920+ (`handle_invoice_upcoming`):** Uses Stripe API call via `httpx` to report metered usage. If `STRIPE_SECRET_KEY` is unset, `_stripe_key()` raises RuntimeError. The caller (`handle_partner_webhook`) catches all exceptions from handlers, so this is safe.

- **Line 1082:** `await db.commit()` is called inside the skipped-event path, then again in the main handler. Double-commit is harmless but slightly redundant.

- **Line 1089:** `await db.commit()` followed by potential `await db.rollback()` on exception. This is correct behavior.

**Minor:** The `__import__("json").dumps()` on line 156 is an unusual pattern; a top-level `import json` would be cleaner, though functionally equivalent.

---

### 6. src/partner/webhook_schemas.py -- PASS

Clean Pydantic models matching Stripe event structures. All use `Field(...)` for required fields and sensible defaults. `StripeWebhookEvent` covers the standard envelope. `metadata` fields correctly typed as `dict[str, str]`.

No issues.

---

### 7. src/partner/admin_router.py -- NEEDS FIX

**Issues:**

- **Lines 365-371 (notify_partner_deactivated call):** The function is called with keyword args `partner_id`, `partner_name`, `contact_email`, `reason`, `deactivated_by`, but `admin_notifications.py` defines `notify_partner_deactivated(partner: SoulPartner, reason: str)`. **Signature mismatch: will raise TypeError at runtime.**

- **Lines 458-464 (notify_partner_reactivated call):** Called with `partner_id`, `partner_name`, `contact_email`, `reason`, `reactivated_by`, but `admin_notifications.py` defines `notify_partner_reactivated(partner: SoulPartner)`. **Signature mismatch: will raise TypeError at runtime.**

- **Lines 551-557 (notify_partner_terms_updated call):** Called with `partner_id`, `partner_name`, `contact_email`, `changes`, `updated_by`, but `admin_notifications.py` defines `notify_partner_terms_updated(partner: SoulPartner, changes: dict)`. **Signature mismatch: will raise TypeError at runtime.**

- **Lines 119-122 (SQL search):** Uses `ILIKE` which is PostgreSQL-specific. Will fail on SQLite in tests. Acceptable for production but tests need raw SQL dialect awareness.

- **Lines 127-157 (raw SQL):** Uses parameterized `text()` queries with `:param` binding. Safe from SQL injection. Table names are hardcoded, not user-supplied. No risk.

- **Line 325-336 (setattr fallback):** Uses try/except AttributeError to handle columns that may not exist yet from migration 0021. This is a reasonable defensive pattern given the staged migration rollout.

**Recommended Fix:** Change admin_router.py notification calls to pass the `partner` object directly:
```python
# Line 365: Change to:
await notify_partner_deactivated(partner=partner, reason=body.reason)

# Line 458: Change to:
await notify_partner_reactivated(partner=partner)

# Line 551: Change to:
await notify_partner_terms_updated(partner=partner, changes=changes)
```

---

### 8. src/partner/admin_schemas.py -- PASS

Well-structured Pydantic models. Validation constraints are reasonable (commission_rate 0.10..0.40, payout_frequency regex pattern, reason min_length=5). Response models use Optional where appropriate.

**Note:** The `PartnerListParams` model is defined but not used as a dependency in admin_router.py (the router uses individual `Query()` params instead). Not a bug, just unused code.

---

### 9. src/partner/admin_notifications.py -- MINOR ISSUE

**Issues:**

- **Lines 188-221, 224-253, 256-291:** Functions accept `partner: SoulPartner` as the first argument, accessing `partner.name`, `partner.contact_email`, `partner.id` etc. This is the correct internal API, but admin_router.py calls them with string keyword args instead. See admin_router.py NEEDS FIX above.

- **Line 23:** Imports `_HEADER, _FOOTER, _cta_button, _kv_row` from `src.email.templates`. These are "private" names (underscore-prefixed) being imported across module boundaries. Functional but architecturally questionable. Both `admin_notifications.py` and `email_templates.py` import these same helpers, creating parallel template rendering paths for the same lifecycle events (deactivation, reactivation, terms update). This is redundant.

**Recommendation:** Consider removing the template rendering from `admin_notifications.py` and delegating to `email_templates.py` functions to avoid duplicate rendering logic.

---

### 10. src/partner/email_templates.py -- MINOR ISSUE

**Issues:**

- **Missing functions:** `email_triggers.py` imports `render_stripe_connect_reminder` and `render_payout_failed_admin`, but `email_templates.py` only defines `render_connect_setup_reminder` (line 197) and has no `render_payout_failed_admin` function. **These import names will cause ImportError at module load time.**

- **Line 58 (`_hex_to_rgba`):** Does not validate input length. Passing a 3-char hex (e.g., `#fff`) would cause IndexError. However, all callers use 6-char hex literals so this is safe in practice.

- **Line 378 (render_monthly_commission_report subject):** Uses em dash character directly in the string. Renders correctly in modern email clients.

All 8 template functions return `(subject, html)` tuples consistently. HTML structure looks valid.

---

### 11. src/partner/email_triggers.py -- NEEDS FIX

**Issues:**

- **Line 23:** `from src.partner.email_templates import render_stripe_connect_reminder` -- this function does not exist in email_templates.py. The actual function is `render_connect_setup_reminder`. **ImportError at load time.**

- **Line 29:** `from src.partner.email_templates import render_payout_failed_admin` -- this function does not exist in email_templates.py. There is no admin variant of the payout failed template. **ImportError at load time.**

- **Lines 49-56 (trigger_partner_invitation):** Calls `render_partner_invitation(contact_name=..., company_name=..., partner_type=..., partner_code=..., onboarding_url=..., token_expires_at=...)` but the actual function signature in email_templates.py is `render_partner_invitation(partner_name, onboarding_url, expires_in_days=30)`. **TypeError at runtime.**

- **Lines 91-99 (trigger_partner_welcome):** Calls with `contact_name`, `company_name`, `partner_type`, `partner_code`, `dashboard_url`, `api_soulkey`, `stripe_connect_needed` but actual signature is `render_partner_welcome(partner_name, partner_type, commission_rate, dashboard_url)`. **TypeError at runtime.**

- **Lines 133-137 (trigger_connect_reminder):** Calls `render_stripe_connect_reminder(contact_name=..., company_name=..., stripe_connect_url=..., days_since_onboarding=...)` but function name is wrong and signature differs. Actual: `render_connect_setup_reminder(partner_name, onboarding_url)`. **ImportError + TypeError.**

- **Lines 171-176 (trigger_partner_deactivated):** Calls with `contact_name`, `company_name`, `reason`, `suspended_at` but actual signature is `render_partner_deactivated(partner_name, reason)`. **TypeError.**

- **Lines 209-214 (trigger_partner_terms_updated):** Calls with `contact_name`, `company_name`, `changes`, `effective_date` but actual signature is `render_partner_terms_updated(partner_name, changes)`. **TypeError.**

- **Lines 252-265 (trigger_monthly_report):** Calls with many kwargs that don't match the actual signature `render_monthly_commission_report(partner_name, month, referral_count, mrr_attributed, commission_earned, payout_amount, dashboard_url)`. **TypeError.**

- **Lines 302-310 (trigger_payout_processed):** Calls with `contact_name`, `amount_formatted`, `payout_date`, etc., but actual signature is `render_payout_processed(partner_name, amount, period, transfer_id)`. **TypeError.**

- **Lines 354-368 (trigger_payout_failed):** Calls with kwargs that don't match, and imports `render_payout_failed_admin` which doesn't exist. **ImportError + TypeError.**

**Root Cause:** The email_triggers.py was written against a different (likely earlier or spec-based) version of the email_templates.py function signatures. The actual templates use simpler signatures. Every single trigger function has mismatched arguments.

**Severity:** HIGH. This entire module will fail to import, which means all email notifications from webhooks and cron jobs will fail silently (since all callers swallow exceptions). The core functionality (admin actions, webhook handling) will still work, but no emails will be sent.

**Recommended Fix:** Rewrite all trigger functions to match the actual `email_templates.py` signatures, rename imports (`render_stripe_connect_reminder` to `render_connect_setup_reminder`), and add a `render_payout_failed_admin` template or remove its usage.

---

### 12. src/partner/slack_notifications.py -- PASS

- Clean Block Kit structure with proper `_header_block`, `_fields_section`, `_context_block` helpers.
- `post_partner_slack` supports both incoming webhook and bot token + channel modes.
- `slack_partner_deactivated` and `slack_payout_failed` use attachment wrappers for color sidebars (correct Slack API pattern).
- `slack_high_value_referral` has a safety threshold check (mrr > 500).
- All functions are non-fatal (try/except around httpx calls).

No issues.

---

### 13. src/partner/setup.py -- MINOR ISSUE

**Issues:**

- **Line 220:** Uses `@app.on_event("startup")` which is deprecated in newer FastAPI versions (use `lifespan` context manager instead). Still functional.

- **Lines 103-104:** Uses lazy `import json` inside the endpoint handler. Fine for cold-start avoidance but unusual.

- **Line 120:** `async with async_session_factory() as db:` -- uses the factory as a context manager. The existing codebase pattern in `get_db()` uses the same approach, so this is consistent.

- **Line 131:** Always returns the handler's `status` field as the HTTP status code. If a handler returns `{"status": 400}` (signature invalid), the webhook endpoint returns 400 to Stripe. This is correct per the docstring (reject invalid signatures) but differs from the common pattern of always returning 200 to Stripe. The signature verification failure is the one exception where 400 is appropriate.

---

### 14. src/partner/response_formatter.py -- PASS

Clean harness-aware formatter. Uses Python 3.10+ `match`/`case` statements consistently. Global `_current_mode` state is simple but effective for a single-process server. All formatters handle empty inputs (empty headers list, zero rows, etc.).

No issues.

---

### 15. alembic/versions/0020_add_partner_type.py -- PASS

- Adds `partner_type` column with `server_default="reseller"` (safe for existing rows).
- Check constraint limits to `reseller`/`mssp`.
- Backfill SQL updates MSSP-tier tenants. Uses parameterized subquery, no injection risk.
- Downgrade drops in correct reverse order.

No issues.

---

### 16. alembic/versions/0021_add_partner_admin_columns.py -- MINOR ISSUE

**Issues:**

- **Line 35:** `deactivated_by` is typed as `sa.Uuid()` but admin_router.py stores string values like `"soulkey:admin-001"`. **Type mismatch.** The column should be `sa.String(255)` or `sa.Text()` to match the string actor labels produced by `_actor_label()`.

- Downgrade is correct (drops in reverse order).

---

### 17. alembic/versions/0022_add_webhook_idempotency.py -- PASS

- Revision chain is correct: `down_revision: str = "0021"` (not 0020 as feared).
- Table schema matches the INSERT statement in webhooks.py.
- Indexes on event_type and processed_at are appropriate.
- Uses `ON CONFLICT (event_id) DO NOTHING` pattern which matches the unique constraint on event_id.

No issues.

---

### 18. tests/test_partner_types.py -- PASS

Good coverage: enum values, capability matrix exhaustive checks, tier map completeness, edge cases (case sensitivity, unknown capabilities). Integration tests for type_guard are properly guarded with skipif.

No issues.

---

### 19. tests/test_tier_enforcement.py -- PASS

Excellent coverage (30+ cases): all allowed tiers, all blocked tiers, depth violations, upgrade constraints, feature flag modes (enforce/monitor/disabled), edge cases (empty tier, unknown tier, case sensitivity, null parent), audit log verification, webhook validation standalone function.

No issues.

---

### 20. tests/test_partner_admin.py -- NEEDS FIX

**Issues:**

- **Lines 44-56 (imports):** Imports `PartnerDetailResponse`, `DeactivateResponse`, `ReactivateResponse`, `UpdateTermsResponse`, `AuditTrailResponse`, `RevokeInvitationResponse` from `admin_schemas`, but these classes do not exist. The actual response models are: `PartnerDetail`, `AdminActionResponse`, `PartnerListResponse`, `InvitationListResponse`. **ImportError will cause all tests to be skipped** (the `_HAS_ADMIN_ROUTER = False` fallback kicks in).

- **Lines 325-329 (test assertions):** Tests expect response keys like `"partners"`, `"page_size"`, `"total_pages"` but the actual `PartnerListResponse` uses `"items"`, `"per_page"`, `"pages"`. Response shape mismatch.

- **Lines 401-408 (pagination test):** Uses `page_size` query param but admin_router.py accepts `per_page`.

- **Lines 447-451 (referrals test):** Expects `body["referrals"]["total"]` and `body["referrals"]["active"]` but actual `PartnerDetail` returns `referrals` as a `list[ReferralInfo]`, not a nested dict.

- **Lines 497-499 (deactivate response):** Expects `body["status"]` and `body["reason"]` but `AdminActionResponse` only has `success`, `message`, `partner_id`.

- **Lines 787-789 (revoke response):** Expects `body["invitation_id"]`, `body["status"]`, `body["revoked_at"]` but `AdminActionResponse` returns `success`, `message`, `partner_id`.

**Root Cause:** Tests were written against a spec/contract that differs from the actual implementation. The response schemas diverged.

**Severity:** MEDIUM. All tests will be skipped due to the ImportError guard, so they won't cause CI failures, but they provide zero actual coverage.

**Recommended Fix:** Update imports and assertions to match actual admin_schemas.py response models.

---

### 21. tests/test_partner_emails.py -- MINOR ISSUE

**Issues:**

- **Lines 36-43 (imports):** Imports `render_stripe_connect_reminder` which doesn't exist (actual: `render_connect_setup_reminder`). **ImportError causes `_HAS_TEMPLATES = False` and all template tests are skipped.**

- **Lines 51-64 (trigger imports):** Imports `on_partner_approved`, `on_partner_onboarded`, `on_stripe_connect_reminder`, etc., which don't exist in email_triggers.py (actual names: `trigger_partner_invitation`, `trigger_partner_welcome`, `trigger_connect_reminder`, etc.). **ImportError causes `_HAS_TRIGGERS = False` and all trigger tests are skipped.**

- **Lines 67-68 (slack import):** Imports `send_partner_slack` which doesn't exist (actual: `post_partner_slack`). **ImportError causes `_HAS_SLACK = False` and all Slack tests are skipped.**

**Root Cause:** Same as test_partner_admin.py. Tests written against a spec that differs from actual function names.

**Severity:** MEDIUM. All tests silently skip, providing zero coverage.

---

## Critical Issues Summary

| # | File | Issue | Impact |
|---|------|-------|--------|
| 1 | email_triggers.py | Imports 2 functions that don't exist in email_templates.py | ImportError at load; no emails ever sent |
| 2 | email_triggers.py | All 8 trigger functions pass wrong kwargs to render functions | TypeError if imports were fixed |
| 3 | admin_router.py | 3 notification calls pass strings instead of SoulPartner object | TypeError on deactivate/reactivate/terms-update |
| 4 | migration 0021 | `deactivated_by` column typed as UUID but receives string values | Postgres will reject the INSERT |
| 5 | test_partner_admin.py | Imports non-existent schema names; all tests silently skip | Zero admin endpoint test coverage |
| 6 | test_partner_emails.py | Imports non-existent function names; all tests silently skip | Zero email/Slack test coverage |

## Recommended Priority

1. **Fix email_triggers.py** -- Align all imports and function call signatures with email_templates.py
2. **Fix admin_router.py notification calls** -- Pass `partner` object instead of individual string args
3. **Fix migration 0021 deactivated_by column type** -- Change from `sa.Uuid()` to `sa.String(255)`
4. **Fix test_partner_admin.py** -- Update imports and assertion shapes
5. **Fix test_partner_emails.py** -- Update imports and function names
6. **Add render_payout_failed_admin to email_templates.py** -- Or remove usage from triggers

## Modules Fully Ready for Production

- types.py
- type_guard.py
- tier_constants.py
- tier_enforcement.py
- webhook_schemas.py
- admin_schemas.py
- slack_notifications.py
- response_formatter.py
- setup.py
- All 3 migrations (with deactivated_by fix)
- webhooks.py (with minor JSON import cleanup)
