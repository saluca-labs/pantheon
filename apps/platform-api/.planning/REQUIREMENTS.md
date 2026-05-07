# Requirements: Tiresias v2.1 — Enterprise Tier System

**Defined:** 2026-03-21
**Core Value:** Three enterprise SKUs (on-prem enterprise, on-prem MSSP, SaaS) from a single codebase using feature flags and tier-based gating.

## v2.1 Requirements

### Tier Framework

- [x] **TIER-01**: Extend tier hierarchy to 6 levels: community < starter < pro < enterprise < mssp < saas
- [x] **TIER-02**: TIRESIAS_TIER env var overrides license tier at deploy time for SKU selection
- [x] **TIER-03**: Extended FEATURE_TIERS registry with mssp-only and saas-only features (tenant_hierarchy, cross_tenant_query, managed_provisioning, billing_integration, white_label)
- [x] **TIER-04**: Tier-specific route guards — /v1/mssp/* gated to mssp+saas, /v1/saas/* gated to saas only
- [x] **TIER-05**: Tier info exposed in /health endpoint and portal session for dashboard conditional rendering

### MSSP Multi-Tenant

- [ ] **MSSP-01**: Parent-child tenant hierarchy — SoulTenant model gets parent_tenant_id FK, max_depth=3
- [ ] **MSSP-02**: Cross-tenant query API — /v1/mssp/tenants lists child tenants with aggregate stats (agents, anomalies, quarantines)
- [ ] **MSSP-03**: Cross-tenant detection view — /v1/mssp/detection/matches returns matches across all child tenants with tenant_id attribution
- [ ] **MSSP-04**: Cross-tenant quarantine view — /v1/mssp/enforcement/quarantine returns quarantines across child tenants
- [ ] **MSSP-05**: Tenant provisioning API — /v1/mssp/tenants POST creates child tenant with inherited policies and configurable feature overrides
- [ ] **MSSP-06**: Tenant isolation enforcement — child tenant queries MUST be scoped to parent's tenant hierarchy, never cross-hierarchy

### SaaS Management

- [ ] **SAAS-01**: Managed provisioning endpoint — /v1/saas/provision creates tenant + admin soulkey + default policies in one call
- [ ] **SAAS-02**: Usage metering — /v1/saas/usage returns per-tenant usage metrics (requests, tokens, anomalies, storage) for billing
- [ ] **SAAS-03**: Billing webhook integration — /v1/saas/billing/webhook receives Stripe events for subscription changes, updates tenant tier accordingly
- [ ] **SAAS-04**: Tenant suspension/reactivation — /v1/saas/tenants/{id}/suspend and /reactivate with grace period

### Dashboard Tier-Awareness

- [ ] **DTIER-01**: Portal reads tier from session and conditionally renders nav items (MSSP section visible only for mssp/saas tier)
- [ ] **DTIER-02**: MSSP dashboard page — tenant hierarchy tree, cross-tenant detection summary, cross-tenant quarantine summary
- [ ] **DTIER-03**: SaaS admin page — tenant provisioning form, usage table, billing status, suspension controls
- [ ] **DTIER-04**: Tier badge in DashboardHeader showing current deployment tier
- [ ] **DTIER-05**: Feature-gated UI components — wrap tier-restricted features with TierGate component that shows upgrade prompt for lower tiers

## Future Requirements (v2.2)

- **ASPH-01**: Asphodel on-prem data binding
- **ASPH-02**: Air-gapped deployment mode
- **WL-01**: Full white-label theming (custom logo, colors, domain)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Asphodel on-prem binding | v2.2 — needs dedicated infrastructure work |
| White-label theming | v2.2 — MSSP white_label flag gates it, but full implementation deferred |
| Stripe billing UI in portal | v2.1 builds webhook receiver only — billing portal uses Stripe hosted |
| Mobile responsive | Desktop-first enterprise tool |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TIER-01 | Phase 10 | Complete (2026-03-20) |
| TIER-02 | Phase 10 | Complete (2026-03-20) |
| TIER-03 | Phase 10 | Complete (2026-03-20) |
| TIER-04 | Phase 10 | Complete (2026-03-20) |
| TIER-05 | Phase 10 | Complete (2026-03-20) |
| MSSP-01 | Phase 11 | Pending |
| MSSP-02 | Phase 11 | Pending |
| MSSP-03 | Phase 11 | Pending |
| MSSP-04 | Phase 11 | Pending |
| MSSP-05 | Phase 11 | Pending |
| MSSP-06 | Phase 11 | Pending |
| SAAS-01 | Phase 12 | Pending |
| SAAS-02 | Phase 12 | Pending |
| SAAS-03 | Phase 12 | Pending |
| SAAS-04 | Phase 12 | Pending |
| DTIER-01 | Phase 13 | Pending |
| DTIER-02 | Phase 13 | Pending |
| DTIER-03 | Phase 13 | Pending |
| DTIER-04 | Phase 13 | Pending |
| DTIER-05 | Phase 13 | Pending |

**Coverage:**
- v2.1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-03-21*
*Traceability populated: 2026-03-21*
