---
gsd_state_version: 1.0
milestone: v2.3
milestone_name: Customer Lifecycle & Self-Service
status: in_progress
stopped_at: "Completed 19-02-PLAN.md — Phase 19 plan 2 of 3 complete"
last_updated: "2026-03-21"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 2
  completed_plans: 4
---

# STATE — Tiresias v2.3 Customer Lifecycle & Self-Service

## Project Reference

**Core Value:** A customer can discover, trial, pay, integrate, troubleshoot, and get support without ever talking to a human — but a human is always 4 hours away on P0.

**Milestone Goal:** Every step of the customer lifecycle — from first landing page visit through active use, billing management, and support — is self-service, automated, and wired into the dashboard.

**Repo:** `github.com/cristianxruvalcaba-coder/tiresias` | Portal: `~/tiresias/portal/` | Backend: `~/tiresias/src/`
**Stack:** Next.js 16, React 19, Tailwind 4, TypeScript (frontend) / FastAPI, SQLite, structlog (backend)
**Access:** `ssh -i C:/Users/crist/.ssh/alfred_id_ed25519 cristian@34.41.26.234`

---

## Current Position

Phase: 19
Plan: 02 (complete) — next plan: 19-03
Status: Plans 19-01 and 19-02 complete — Phase 19 in progress

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total (v2.3) | 6 (phases 16-21) |
| Phases complete (v2.3) | 0 |
| Requirements total (v2.3) | 27 |
| Requirements mapped | 27 |
| Requirements complete | 0 |
| Plans written (v2.3) | 2 |
| Plans complete (v2.3) | 2 |

---

## v2.3 Phase Map

| Phase | Name | Requirements | Depends On | Status |
|-------|------|--------------|------------|--------|
| 16 | Trial & Checkout | TRIAL-01, TRIAL-02, TRIAL-03, TRIAL-04, TRIAL-05, BILL-03 | Phase 15 | Not started |
| 17 | Billing & Key Management | BILL-01, BILL-02, BILL-04, KEY-01, KEY-02, KEY-03, KEY-04 | Phase 16 | Not started |
| 18 | Usage & Limits | USAGE-01, USAGE-02, USAGE-03 | Phase 17 | Not started |
| 19 | Self-Service Chatbot | BOT-01, BOT-02, BOT-03, BOT-04, BOT-05, BOT-06, BOT-07 | Phase 18 | In progress (plans 01-02 done) |
| 20 | Lifecycle Emails | EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04, EMAIL-05 | Phase 18 | Not started |
| 21 | Dashboard Integration | TRIAL-03 (welcome wizard wiring) + all Phase 16-20 integration | Phase 19, Phase 20 | Not started |

**Parallelization note:** Phases 19 and 20 can be planned and executed in parallel after Phase 18 completes. Phase 21 depends on both.

---

## Accumulated Context

### Key Decisions (v2.3)

| Decision | Rationale |
|----------|-----------|
| 16-01: Stripe 2026-02-25 invoice subscription path is invoice.parent.subscription_details.subscription | Stripe's 2026 API moved the subscription reference under the parent object — top-level invoice.subscription no longer exists in TypeScript types |
| 16-01: raw_key stored ephemerally in Stripe subscription metadata | Allows /checkout/success page to retrieve the soulkey without a separate storage layer; cleared on first read so it is never stored at rest |
| 16-01: trial_expiry.py uses get_db() not get_db_session() | Actual export from src.database.connection is get_db; trial_expiry imports it as a generator for async for loop |
| 16-02: Trial page fully rewritten for Community focus | Old multi-product paid trial layout incompatible with Community free signup goal — clean rewrite was faster and clearer |
| 16-02: NEXT_PUBLIC_API_URL used directly in trial page | Avoids importing config module; consistent with env pattern; SSR-safe via typeof window guard |
| BILL-03 (webhook handler) in Phase 16, not Phase 17 | Stripe checkout.session.completed webhook must exist before checkout can provision tenants — it is a prerequisite, not a billing feature |
| TRIAL-03 (welcome page) assigned to Phase 16, integrated in Phase 21 | Page is created as part of checkout flow (Phase 16) but wired into the unified dashboard experience in Phase 21 |
| Phases 19 and 20 parallel after Phase 18 | Chatbot and lifecycle emails are independent systems with shared dependency on usage/limits data from Phase 18 |
| Phase 21 is integration-only | No new backend endpoints — Phase 21 wires together what Phases 16-20 built into a coherent user journey |
| OpenRouter for chatbot LLM | gemma-3-27b or gpt-4o-mini via OpenRouter (free/cheap credits) — never Anthropic API for this workload |
| Resend for transactional email | Already in Alfred fleet; Resend API is standard. No new email vendor needed |
| Linear + Telegram for P0 escalation | Matches existing Alfred ops infrastructure — Linear ticket + Telegram notification to Saluca ops channel |

### Key Architectural Facts (carried forward from v2.2)

| Fact | Detail |
|------|--------|
| Tier infra | FeatureGateMiddleware uses TIER_ORDER rank hierarchy; FEATURE_MIN_TIER is source of truth |
| Current tiers | community, starter, pro, enterprise, mssp, saas (6 tiers) |
| Provisioning endpoint | POST /v1/saas/provision — creates tenant + admin soulkey + default policies atomically (Phase 12) |
| Billing webhook | /v1/saas/billing/webhook — already accepts Stripe events (Phase 12); Phase 16 extends event handling |
| Stripe integration | Phase 12 established the webhook handler pattern; Phase 16 adds checkout session + subscription events |
| TierGate component | Exported from @/components/dashboard/TierGate — reuse for upgrade prompts |
| CSS token layer | globals.css uses Obsidian Flux custom properties (--of-primary, --of-background, --of-accent, etc.) |
| useWidgetData hook | 30s auto-refresh, auth headers — standard fetch pattern across all dashboard pages |
| SoulTenant metadata_ | JSON column — used for branding (v2.2); usage metrics can extend the same pattern |
| Existing audit log | /v1/audit endpoint — Phase 17 key usage stats (KEY-04) query this for per-key request counts |

### Todos

- [ ] Confirm Stripe API keys in _alfred_vault before planning Phase 16
- [ ] Confirm Resend API key in _alfred_vault before planning Phase 20
- [ ] Check if /v1/saas/billing/webhook already handles checkout.session.completed or only subscription events
- [ ] Audit existing soulkey table schema before planning KEY-01..04
- [ ] Check if RAG/vector infra exists on GCP before planning BOT-03 (Qdrant is on agent-zero container)

### Blockers

None at roadmap creation.

---

## Session Continuity

**Last session:** 2026-03-21
**Stopped at:** Completed 19-02-PLAN.md — chatbot actions, escalation, and history
**Next action:** Execute 19-03-PLAN.md (dashboard integration for chatbot)

---

*State initialized for v2.3: 2026-03-21*
