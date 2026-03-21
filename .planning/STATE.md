---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Enterprise Tier System
status: in_progress
stopped_at: Phase 10 Plan 01 complete — 6-tier hierarchy, TIRESIAS_TIER override, /health tier exposure
last_updated: "2026-03-20T05:12:00Z"
progress:
  total_phases: 13
  completed_phases: 9
  total_plans: 24
  completed_plans: 19
---

# STATE — Tiresias v2.1 Enterprise Tier System

## Project Reference

**Core Value:** Security analysts can detect, investigate, and respond to AI agent threats — from prompt injection to behavioral anomalies — without ever leaving the Tiresias dashboard.

**Milestone Goal:** Three enterprise SKUs (on-prem enterprise, on-prem MSSP, SaaS) from a single codebase using feature flags and tier-based gating — no branches per SKU.

**Repo:** `github.com/cristianxruvalcaba-coder/tiresias` | Portal: `~/tiresias/portal/` | Backend: `~/tiresias/src/`
**Stack:** Next.js 16, React 19, Tailwind 4, TypeScript (frontend) / FastAPI, SQLite, structlog (backend)
**Access:** `ssh -i C:/Users/crist/.ssh/alfred_id_ed25519 cristian@34.41.26.234`

---

## Current Position

Phase: 10 (Tier Framework) — COMPLETE
Plan: 1 of 1 complete — ready for Phase 11

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total (v2.1) | 4 (phases 10–13) |
| Phases complete (v2.1) | 1 |
| Requirements total (v2.1) | 20 |
| Requirements mapped | 20 |
| Requirements complete | 5 (TIER-01 through TIER-05) |
| Plans written (v2.1) | 1 |
| Plans complete (v2.1) | 1 |
| Duration (Phase 10) | ~22 min |

---

## v2.1 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 10 | Tier Framework | TIER-01, TIER-02, TIER-03, TIER-04, TIER-05 | COMPLETE (2026-03-20) |
| 11 | MSSP Multi-Tenant | MSSP-01, MSSP-02, MSSP-03, MSSP-04, MSSP-05, MSSP-06 | Not started |
| 12 | SaaS Management | SAAS-01, SAAS-02, SAAS-03, SAAS-04 | Not started |
| 13 | Dashboard Tier-Awareness | DTIER-01, DTIER-02, DTIER-03, DTIER-04, DTIER-05 | Not started |

---

## Accumulated Context

### Key Decisions (v2.1)

| Decision | Rationale |
|----------|-----------|
| Feature flags over branches | Merge hell with 3 SKU branches kills velocity — single codebase, TIRESIAS_TIER env var at deploy time |
| Tier hierarchy: community<starter<pro<enterprise<mssp<saas | Each tier includes all lower-tier features; mssp and saas are new additions to existing 4-tier system |
| Tenant hierarchy for MSSP | Parent-child model (max_depth=3), not flat list — mirrors real MSSP org structures |
| Phase 10 before 11+12 | Route guards and feature registry must exist before MSSP/SaaS APIs can be gated correctly |
| Phase 11 and 12 independent | MSSP and SaaS layers have no dependency on each other — can be planned/executed in parallel if needed |
| Phase 13 last | Dashboard wiring depends on both Phase 11 (MSSP APIs) and Phase 12 (SaaS APIs) being complete |
| Backward compatibility required | Existing enterprise tier must not break — only additive changes to FEATURE_TIERS and tier validator |
| No new Python deps | stdlib + existing FastAPI/SQLAlchemy/structlog stack only |
| TIER_ORDER rank comparison (Phase 10) | _tier_rank() index comparison replaces set membership — enables hierarchical inheritance without listing all tiers per feature |
| 403 vs 402 for SKU gates (Phase 10) | mssp/saas routes return 403 (wrong SKU), lower-tier routes return 402 (upgrade needed) — distinct portal CTA per error |
| validation_alias bypasses env_prefix (Phase 10) | TIRESIAS_TIER field uses validation_alias="TIRESIAS_TIER" to bypass SOULAUTH_ prefix for one deployment-level variable |

### Key Architectural Facts (carried forward)

| Fact | Detail |
|------|--------|
| Tier infra (Phase 10) | FeatureGateMiddleware uses TIER_ORDER rank hierarchy; FEATURE_MIN_TIER is source of truth; get_enabled_features(tier) available |
| Current tiers | community, starter, pro, enterprise, mssp, saas (6 tiers — Phase 10 complete) |
| Route guards | /v1/mssp -> 403 for non-mssp; /v1/saas -> 403 for non-saas |
| Health tier exposure | GET /health returns active_tier + enabled_features in both simple and detailed modes |
| Detection stack | Sigma engine, anomaly detector (18 types post-v2.0), PRH engine, quarantine engine — all complete |
| Data fetching pattern | useWidgetData hook — 30s auto-refresh, auth headers, standard across all pages |
| Chart pattern | CSS div-based, conic-gradient donuts, SVG gauges — no chart library |

### Todos

- [x] Plan Phase 10 (Tier Framework) — complete
- [x] Verify existing FeatureGateMiddleware structure before extending FEATURE_TIERS — done in Phase 10
- [ ] Confirm SoulTenant model schema before adding parent_tenant_id FK (Phase 11)
- [ ] Execute Phase 11 (MSSP Multi-Tenant) — run `/gsd:execute-phase 11`

### Blockers

None at roadmap creation.

---

## Session Continuity

**Last session:** 2026-03-20
**Stopped at:** Phase 10 Plan 01 complete — 6-tier hierarchy, TIRESIAS_TIER override, /health tier exposure
**Next action:** Execute Phase 11 (MSSP Multi-Tenant) — run `/gsd:execute-phase 11`

---

*State initialized: 2026-03-20 (v1.0)*
*Reset for v2.0: 2026-03-20*
*Reset for v2.1: 2026-03-21*
