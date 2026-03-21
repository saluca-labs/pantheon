---
phase: 12-saas-management
plan: 01
subsystem: api
tags: [fastapi, sqlalchemy, stripe, saas, metering, billing, provisioning, soulkey]

# Dependency graph
requires:
  - phase: 10-tier-framework
    provides: FeatureGateMiddleware, FEATURE_TIERS, route guards for /v1/saas, SoulTenant.tier field
  - phase: 10-tier-framework
    provides: issue_soulkey() function in src/auth/soulkey.py

provides:
  - POST /v1/saas/provision — atomic tenant + admin soulkey + default policy in single transaction
  - GET /v1/saas/usage — per-tenant AuditLog aggregation (requests, tokens, anomalies, storage_bytes)
  - POST /v1/saas/billing/webhook — Stripe subscription lifecycle to tenant tier updates
  - POST /v1/saas/tenants/{id}/suspend — cascading tenant + soulkey suspension
  - POST /v1/saas/tenants/{id}/reactivate — reinstate with grace_period_log metadata entry

affects: [13-dashboard-tier-awareness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic multi-model provisioning: db.flush() after each model before final auto-commit"
    - "Stripe tenant resolution: metadata.tenant_id -> customer_id metadata scan fallback"
    - "Cascading suspension: tenant status change propagates to all active Soulkey rows"
    - "Grace period tracking: suspension_history + grace_period_log arrays in tenant metadata_"

key-files:
  created:
    - ~/tiresias/src/saas/__init__.py
    - ~/tiresias/src/saas/metering.py
    - ~/tiresias/src/saas/billing.py
    - ~/tiresias/src/saas/router.py
  modified:
    - ~/tiresias/src/main.py

key-decisions:
  - "No Stripe SDK dependency — webhook endpoint uses JSON body parsing only; signature verification deferred to post-launch"
  - "Token count derived from AuditLog.context JSON field (context->tokens); no dedicated token column needed"
  - "Storage bytes estimated at 512 bytes/audit record — rough billing proxy, not precise measurement"
  - "Suspend cascades to soulkeys; reactivate only reinstates keys suspended_by=saas_operator (not individually-suspended keys)"

patterns-established:
  - "Provision pattern: flush each model (tenant -> soulkey -> policy -> audit) within one get_db session"
  - "Stripe tier map: STRIPE_TIER_MAP dict maps plan nicknames/IDs to Tiresias tier strings"

requirements-completed: [SAAS-01, SAAS-02, SAAS-03, SAAS-04]

# Metrics
duration: 12min
completed: 2026-03-20
---

# Phase 12 Plan 01: SaaS Management Summary

**Five-endpoint SaaS management layer — atomic provisioning with soulkey issuance, AuditLog-based usage metering, Stripe subscription webhook, and tenant suspension/reactivation with grace period logging**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-20T05:00:00Z
- **Completed:** 2026-03-20T05:12:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Atomic tenant provisioning in single SQLAlchemy transaction (SoulTenant + Soulkey + PolicyCache + AuditLog); IntegrityError on slug collision returns 409
- Per-tenant usage metering from AuditLog aggregation — requests, tokens (context JSON extraction), anomalies, storage estimate; unknown tenant returns 404
- Stripe webhook processes subscription.updated/created (tier update) and subscription.deleted (downgrade to starter); resolves tenant by metadata.tenant_id or stripe_customer_id scan
- Suspend cascades to all active Soulkeys; reactivate reinstates only saas_operator-suspended keys and appends grace_period_log entry to tenant metadata

## Task Commits

Each task was committed atomically:

1. **Tasks 1+2+3: Create src/saas/ package + register router** - `3fa4048` (feat)

**Note:** All three tasks were committed in a single atomic commit since they form one cohesive module.

## Files Created/Modified

- `~/tiresias/src/saas/__init__.py` - Package marker with docstring
- `~/tiresias/src/saas/metering.py` - `get_tenant_usage(db, tenant_id, start, end)` — AuditLog aggregation
- `~/tiresias/src/saas/billing.py` - `handle_stripe_event(db, event_type, event_data)` — Stripe tier lifecycle
- `~/tiresias/src/saas/router.py` - All 5 SaaS endpoints with Pydantic schemas and error handling
- `~/tiresias/src/main.py` - Added `from src.saas.router import router as saas_router` + `app.include_router(saas_router)`

## Decisions Made

- No Stripe SDK added — webhook endpoint parses JSON directly; route is already protected by SaaS-tier gate from Phase 10. Signature verification can be added later via HMAC-SHA256 env var.
- Token count uses Python-side aggregation from `AuditLog.context` JSON field (not DB-side JSON extraction) for SQLite/PostgreSQL portability.
- Suspension of soulkeys on `suspended_by` field value `"saas_operator"` enables selective reactivation — keys suspended for other reasons remain suspended.

## Deviations from Plan

None — plan executed exactly as written. One minor cleanup: removed the unused `token_query` variable (dead code referencing `func.json_extract_path_text`) from metering.py before the context-based Python aggregation was kept instead.

## Issues Encountered

- SCP path resolution issue in Git Bash on Windows (`/c/tmp/` vs `/tmp/`): resolved by piping file content via `cat ... | ssh ... 'cat > ...'` heredoc pattern instead of scp.

## User Setup Required

None — no external service configuration required beyond Phase 10's TIRESIAS_TIER=saas deployment flag.

## Next Phase Readiness

- Phase 12 complete. All 4 SAAS requirements satisfied (SAAS-01 through SAAS-04).
- Phase 13 (Dashboard Tier-Awareness) can now wire SaaS admin views to /v1/saas/* endpoints.
- Phase 11 (MSSP) is independent and may be executed in parallel or before Phase 13.

---
*Phase: 12-saas-management*
*Completed: 2026-03-20*
