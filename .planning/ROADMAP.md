# Roadmap: Tiresias — Dashboard & Detection Platform

**Milestone v1.0:** UI Redesign (Obsidian Flux) — COMPLETE
**Milestone v2.0:** Aletheia Detection
**Milestone v2.1:** Enterprise Tier System
**Granularity:** Coarse
**Coverage:**
- v1.0: 37/37 requirements mapped (complete)
- v2.0: 25/25 requirements mapped
- v2.1: 20/20 requirements mapped

---

## Phases

### v1.0 — UI Redesign (COMPLETE)

- [x] **Phase 1: Design & Mockups** - Obsidian Flux design system, Stitch SDK pipeline, 6 screen mockups (COMPLETE)
- [x] **Phase 2: Design System Foundation** - Establish Obsidian Flux tokens, sidebar, and layout shell in the portal codebase (completed 2026-03-20)
- [x] **Phase 3: Dashboard Pages** - Restyle all 6 existing dashboard sections to match Stitch mockups and wire to live API endpoints (completed 2026-03-20)
- [x] **Phase 4: Quarantine & Detection** - Build two new views (quarantine management and detection feed) and wire to enforcement/detection endpoints (completed 2026-03-20)

### v2.0 — Aletheia Detection

- [ ] **Phase 5: Gap Closure** - Close v1.0 debt: quarantine prompt text, Sigma rule editor, rule tester, playbook viewer
- [ ] **Phase 6: PRH Engine** - Build prompt risk heuristic analyzer with 6 threat categories, Sigma integration, middleware hook, and config API
- [ ] **Phase 7: Anomaly Expansion** - Expand anomaly detector from 8 to 18 types with full baseline/evidence/severity logic
- [x] **Phase 8: SIEM Connectors** - CEF formatter, syslog transport, webhook relay, config API, and health status (completed 2026-03-20)
- [x] **Phase 9: Dashboard Integration** - Wire all v2.0 backend capabilities to dashboard UI with new pages and updated nav (completed 2026-03-21)

### v2.1 — Enterprise Tier System

- [ ] **Phase 10: Tier Framework** - Extend to 6-tier hierarchy, TIRESIAS_TIER env override, extended feature registry, tier-specific route guards, tier exposure in /health
- [ ] **Phase 11: MSSP Multi-Tenant** - Parent-child tenant hierarchy, cross-tenant query/detection/quarantine APIs, tenant provisioning, isolation enforcement
- [ ] **Phase 12: SaaS Management** - Managed provisioning endpoint, usage metering, Stripe billing webhook, tenant suspension/reactivation
- [ ] **Phase 13: Dashboard Tier-Awareness** - Tier-conditional nav, MSSP dashboard page, SaaS admin page, tier badge, TierGate component

---

## Phase Details

### Phase 1: Design & Mockups
**Goal**: Design artifacts are production-ready references
**Depends on**: Nothing
**Requirements**: (Pre-build — all validated)
**Success Criteria** (what must be TRUE):
  1. Obsidian Flux design system is documented with color tokens, typography, surface levels, and component guidelines
  2. 6 screen mockups (Overview, Traces, Sessions, Providers, Costs, Playground) exist as HTML + PNG
  3. Stitch SDK pipeline scripts can regenerate mockups from the design brief
**Status**: COMPLETE
**Plans**: N/A

### Phase 2: Design System Foundation
**Goal**: Every dashboard page shares the Obsidian Flux visual language through a single token layer and consistent navigation
**Depends on**: Phase 1
**Requirements**: DSGN-01, DSGN-02, DSGN-03
**Success Criteria** (what must be TRUE):
  1. Dashboard background renders #121318, surfaces use tonal depth levels, Electric Mint (#5adace) accent appears on interactive elements
  2. Sidebar shows active state highlighting for the current page and is visually identical across all dashboard routes
  3. Layout reflows without horizontal scroll at 1024px viewport width and uses 1440px as the design baseline
  4. Manrope headings and Inter body text are applied consistently; JetBrains Mono is used in all monospace contexts
**Status**: COMPLETE
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Replace globals.css with Obsidian Flux token system + add Manrope font
- [x] 02-02-PLAN.md — Restyle DashboardSidebar and dashboard layout with Obsidian Flux tokens
- [x] 02-03-PLAN.md — Typography utilities, responsive auto-collapse at 1024px, visual verification checkpoint

### Phase 3: Dashboard Pages
**Goal**: All six existing dashboard sections look and feel like the Stitch mockups and surface live data from the API
**Depends on**: Phase 2
**Requirements**: OVER-01, OVER-02, OVER-03, OVER-04, OVER-05, TRAC-01, TRAC-02, TRAC-03, TRAC-04, SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, PROV-01, PROV-02, PROV-03, COST-01, COST-02, COST-03, COST-04, COST-05, PLAY-01, PLAY-02, PLAY-03, PLAY-04, PLAY-05, DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, CHRM-01, CHRM-02
**Success Criteria** (what must be TRUE):
  1. Overview page shows live KPI cards with deltas, requests/cost charts, provider health strip, and recent trace stream — all populated from `/dash/v1/spend`, `/dash/v1/requests`, and `/dash/v1/providers/health`
  2. Traces page renders a filterable, paginated table where clicking a row expands the prompt and completion in monospace with latency color coding (green/yellow/red)
  3. Sessions page shows a two-panel layout where selecting a session loads a turn-by-turn replay timeline and each turn has an "Open in Playground" link
  4. Providers page shows health cards with status badges and a latency comparison chart (p50/p95/p99) populated from `/dash/v1/providers/health` and `/dash/v1/latency`
  5. Costs page shows monthly/projected/remaining KPIs, cost-by-provider and cost-by-model charts, and a top sessions table — plus a "Set Budget Alert" button
  6. Playground page opens with a split editor, can import a session turn, shows model metadata with estimated cost, and executes a prompt run against the selected provider
  7. Dashboard chrome replaces marketing Navbar with a sticky DashboardHeader showing page title, search, notification bell, and user avatar — using only Obsidian Flux tokens
**Status**: COMPLETE
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — DashboardHeader component, Navbar swap in layout.tsx, Observability nav group in sidebar (CHRM-01, CHRM-02)
- [x] 03-02-PLAN.md — Overview, Traces, Sessions pages wired to live API (OVER-01..05, TRAC-01..04, SESS-01..05, DATA-01..03)
- [x] 03-03-PLAN.md — Providers, Costs, Playground pages wired to live API (PROV-01..03, COST-01..05, PLAY-01..05, DATA-04..05)

### Phase 4: Quarantine & Detection
**Goal**: Security analysts can monitor, investigate, and act on quarantined agents and detection rule matches directly from the dashboard
**Depends on**: Phase 2
**Requirements**: QUAR-01, QUAR-02, QUAR-03, QUAR-04, QUAR-05, QUAR-06, DATA-06, DATA-07
**Success Criteria** (what must be TRUE):
  1. Quarantine list shows all quarantined soulkeys with status badges, triggered-by reason, timestamps, and action buttons (release, view) — populated from `/v1/enforcement/quarantine/*`
  2. Clicking a quarantined session opens a detail view showing the full session data and the specific flagged prompt/completion that triggered quarantine
  3. An analyst can manually quarantine a soulkey by filling a reason + action form, and release a quarantined key, both with audit trail confirmation
  4. Detection feed shows recent Sigma rule matches with severity, matched fields, timestamps, and linked playbook — populated from `/v1/detection/matches`
  5. Anomaly indicators surface on the feed (rate spikes, unusual resources, off-hours, geo anomalies, scope escalation) with enough context for immediate triage
**Status**: COMPLETE
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md — Detection nav group in sidebar + Quarantine page (list, detail, quarantine/release actions) (QUAR-01, QUAR-02, QUAR-03, QUAR-04, DATA-06)
- [x] 04-02-PLAN.md — Detection Feed page (Sigma matches, anomaly indicator strip) (QUAR-05, QUAR-06, DATA-07)

---

### Phase 5: Gap Closure
**Goal**: Analysts can read the exact prompt text that triggered quarantine, manage Sigma detection rules, and view playbook configurations — closing all v1.0 functional debt
**Depends on**: Phase 4
**Requirements**: GAP-01, GAP-02, GAP-03, GAP-04
**Success Criteria** (what must be TRUE):
  1. Quarantine detail API response includes the flagged prompt text and completion text that caused the quarantine action
  2. Analyst can create a new Sigma rule via API, edit YAML content of an existing rule, toggle a rule enabled/disabled, and delete a rule — all operations return updated rule state
  3. Analyst can submit a sample event JSON payload against a rule ID and receive a match/no-match response with matched fields highlighted
  4. Playbook list API returns all playbooks with trigger rules, severity thresholds, cooldown seconds, and approval requirements per playbook
**Plans**: 2 plans

Plans:
- [ ] 05-01-PLAN.md — Backend: add flagged_prompt/flagged_completion to quarantine response; Frontend: render in detail panel (GAP-01)
- [ ] 05-02-PLAN.md — Frontend: Sigma rule editor page (CRUD + YAML editor + test panel) + playbook viewer page + sidebar links (GAP-02, GAP-03, GAP-04)

### Phase 6: PRH Engine
**Goal**: The backend can score any prompt for risk in real-time across 6 threat categories, store evidence in the audit log, fire Sigma-compatible events, and expose tenant configuration — making prompt content a first-class detection signal
**Depends on**: Phase 5
**Requirements**: PRH-01, PRH-02, PRH-03, PRH-04, PRH-05, PRH-06
**Success Criteria** (what must be TRUE):
  1. Submitting a prompt to the PRH analyzer returns a risk score (0.0–1.0), matched category, matched patterns, and confidence — within 50ms (pure Python, no I/O)
  2. All 6 threat categories (injection, jailbreak, data exfiltration, PII leakage, instruction override, role manipulation) produce correct match/no-match results against a test fixture set
  3. A PRH finding above the configured threshold emits a structured event to the Sigma engine that triggers existing rules and fires playbooks
  4. PRH scores and evidence (category, patterns, confidence) appear in the audit log and are queryable via existing `/v1/audit` endpoint
  5. Enabling the PRH middleware for a tenant causes all proxied prompts to be scored before pass-through; prompts above auto-quarantine threshold are blocked and quarantined
  6. Tenant can set risk threshold, enable/disable individual categories, and set auto-quarantine level via `/v1/prh/config` — changes take effect immediately
**Plans**: 3 plans

Plans:
- [ ] 06-01-PLAN.md — Core PRH analyzer + 6-category pattern library (PRH-01, PRH-02)
- [ ] 06-02-PLAN.md — Sigma bridge + audit log integration (PRH-03, PRH-04)
- [ ] 06-03-PLAN.md — PRH middleware + config API + main.py wiring (PRH-05, PRH-06)

### Phase 7: Anomaly Expansion
**Goal**: The anomaly detector covers 18 behavioral threat types — each with its own baseline logic, severity assignment, and evidence — and all new types surface in the existing detection feed without any frontend changes
**Depends on**: Phase 5
**Requirements**: ANOM-01, ANOM-02, ANOM-03
**Success Criteria** (what must be TRUE):
  1. Anomaly detector module defines all 10 new types: credential_rotation, session_hijack, model_abuse, token_harvesting, data_poisoning, lateral_movement, persistence, evasion, supply_chain, resource_abuse
  2. Each new type has a detection function with baseline comparison, a severity level (low/medium/high/critical), and an evidence dict matching the schema of the existing 8 types
  3. Calling `/v1/analytics/anomalies` returns new anomaly types alongside existing ones — no frontend or API contract changes required
**Plans**: 1 plan

Plans:
- [ ] 07-01-PLAN.md — Add 10 new AnomalyType enum values, 8 new AgentBaseline fields, and 10 check methods to AnomalyDetector (ANOM-01, ANOM-02, ANOM-03)

### Phase 8: SIEM Connectors
**Goal**: Detection events, anomalies, and quarantine actions flow to enterprise SIEM systems via CEF/syslog and webhook, with tenant-configurable routing and health visibility
**Depends on**: Phase 5
**Requirements**: SIEM-01, SIEM-02, SIEM-03, SIEM-04, SIEM-05
**Success Criteria** (what must be TRUE):
  1. A detection event passed to the CEF formatter produces a valid CEF string with correct header fields (Version, Device Vendor, Device Product, Severity) and extension key-value pairs
  2. Configuring a syslog endpoint (UDP/TCP/TLS) causes detection events to be transmitted to that endpoint within 5 seconds of firing; failed sends are logged with error detail
  3. Configuring a webhook URL causes detection events to be POSTed as JSON with at least 3 retry attempts on non-2xx response; successful and failed deliveries are recorded
  4. Tenant can create/update/delete syslog and webhook connector configs via `/v1/siem/*` endpoints; event filters (by severity, type) are respected in delivery
  5. `/v1/siem/health` returns connector status (connected/error/disabled) and last event timestamp for each configured connector
**Status**: COMPLETE (2026-03-20)
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md — CEF formatter, syslog transport (UDP/TCP/TLS), webhook relay with retry (SIEM-01, SIEM-02, SIEM-03)
- [x] 08-02-PLAN.md — SIEMManager singleton, /v1/siem/* CRUD API, /v1/siem/health, main.py wire-up (SIEM-04, SIEM-05)

### Phase 9: Dashboard Integration
**Goal**: Every v2.0 backend capability — PRH scores, expanded anomalies, SIEM connectors, gap-closure APIs — is fully accessible from the dashboard with no analyst needing to use the API directly
**Depends on**: Phase 6, Phase 7, Phase 8
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06
**Success Criteria** (what must be TRUE):
  1. PRH dashboard page shows recent prompt risk scores as a time-series, a ranked list of risky sessions, a donut breakdown by threat category, and an inline threshold configuration form
  2. Quarantine detail view displays the flagged prompt and completion text sourced from PRH analysis alongside the existing enforcement metadata
  3. SIEM configuration page allows adding/editing syslog and webhook connectors, shows per-connector status badges and last event timestamps, and has a "Test Connectivity" button per connector
  4. Sigma rule editor page renders a full CRUD table of rules with a YAML editor panel, inline enable/disable toggle, and a test panel where analyst pastes a sample event and sees match result
  5. Playbook viewer page lists all playbooks with trigger rules, severity thresholds, cooldown, and approval requirement fields — read-only, no edit required
  6. Detection sidebar nav group contains links for PRH, SIEM Config, Rule Editor, and Playbooks — all routes resolve and render without console errors
**Plans**: 2 plans

Plans:
- [x] 09-01-PLAN.md — PRH dashboard page + sidebar nav update + DashboardHeader titles (DASH-01, DASH-02, DASH-06)
- [x] 09-02-PLAN.md — SIEM config page + verify existing rule editor and playbook pages (DASH-03, DASH-04, DASH-05)

---

### Phase 10: Tier Framework
**Goal**: The backend enforces a 6-tier hierarchy at deploy time via TIRESIAS_TIER, new tier-specific routes are gated correctly, and the portal can read the active tier to drive conditional rendering
**Depends on**: Phase 9
**Requirements**: TIER-01, TIER-02, TIER-03, TIER-04, TIER-05
**Success Criteria** (what must be TRUE):
  1. Deploying with TIRESIAS_TIER=mssp causes all mssp-tier features to be active; deploying with TIRESIAS_TIER=enterprise leaves mssp/saas features inactive — verified via /health response
  2. A request to /v1/mssp/* with a non-mssp license token returns 403; a request with mssp or saas token returns 200 — route guard enforced at middleware level
  3. A request to /v1/saas/* with an mssp token returns 403; only saas token grants access — strict upper-bound gating confirmed
  4. The feature registry contains tenant_hierarchy, cross_tenant_query, managed_provisioning, billing_integration, and white_label entries with correct tier assignments
  5. /health endpoint includes active_tier and enabled_features fields; portal session includes tier so frontend can read it without an extra API call
**Plans**: 1 plan

Plans:
- [ ] 10-01-PLAN.md — Extend to 6-tier hierarchy, TIRESIAS_TIER env override, feature registry, route guards, /health tier exposure (TIER-01, TIER-02, TIER-03, TIER-04, TIER-05)

### Phase 11: MSSP Multi-Tenant
**Goal**: An MSSP operator can manage a hierarchy of child tenants, query detection and quarantine data across all of them in one call, provision new tenants, and be guaranteed child queries never leak across unrelated hierarchies
**Depends on**: Phase 10
**Requirements**: MSSP-01, MSSP-02, MSSP-03, MSSP-04, MSSP-05, MSSP-06
**Success Criteria** (what must be TRUE):
  1. SoulTenant model has parent_tenant_id FK with max_depth=3 enforced — creating a 4th-level child tenant returns a validation error
  2. GET /v1/mssp/tenants returns all child tenants with aggregate stats (agent count, anomaly count, quarantine count) — a tenant with no children returns an empty list, not an error
  3. GET /v1/mssp/detection/matches returns matches across all child tenants, each result has a tenant_id field, and results from sibling hierarchies are absent
  4. GET /v1/mssp/enforcement/quarantine returns quarantines scoped to the parent's hierarchy — cross-hierarchy records are never returned
  5. POST /v1/mssp/tenants creates a child tenant with inherited policies and optional feature overrides, returning the new tenant_id and admin credentials in one response
  6. A query issued from child tenant A cannot return data belonging to child tenant B when both share the same parent — isolation verified by attempting cross-child query
**Plans**: 2 plans

Plans:
- [ ] 11-01-PLAN.md — Tenant hierarchy model + isolation enforcement (MSSP-01, MSSP-06)
- [ ] 11-02-PLAN.md — Cross-tenant APIs + tenant provisioning (MSSP-02, MSSP-03, MSSP-04, MSSP-05)

### Phase 12: SaaS Management
**Goal**: Saluca operators can provision a fully-configured tenant in one API call, meter usage for billing, process Stripe subscription lifecycle events, and suspend or reactivate tenants with a grace period
**Depends on**: Phase 10
**Requirements**: SAAS-01, SAAS-02, SAAS-03, SAAS-04
**Success Criteria** (what must be TRUE):
  1. POST /v1/saas/provision creates a tenant, admin soulkey, and default policies atomically — if any step fails, no partial records remain
  2. GET /v1/saas/usage returns per-tenant metrics (requests, tokens, anomalies, storage) with a time-range parameter; missing tenants return 404, not an empty aggregate
  3. A Stripe subscription.updated webhook received at /v1/saas/billing/webhook updates the tenant tier field within the same request — the webhook returns 200 within 3 seconds
  4. POST /v1/saas/tenants/{id}/suspend sets tenant to suspended state; the tenant's API calls return 402 during suspension; POST /reactivate restores access with grace-period logging
**Plans**: TBD

### Phase 13: Dashboard Tier-Awareness
**Goal**: The portal reads the active deployment tier and conditionally surfaces MSSP and SaaS management interfaces — analysts on lower tiers see upgrade prompts instead of blank pages, MSSP operators see a full cross-tenant view, SaaS admins see provisioning and billing controls
**Depends on**: Phase 11, Phase 12
**Requirements**: DTIER-01, DTIER-02, DTIER-03, DTIER-04, DTIER-05
**Success Criteria** (what must be TRUE):
  1. On an enterprise-tier deploy, the sidebar MSSP section is absent; on an mssp or saas deploy, it is present and navigable — no page refresh required after tier change
  2. MSSP dashboard page renders a tenant hierarchy tree, cross-tenant detection summary counts, and cross-tenant quarantine summary — all populated from Phase 11 APIs
  3. SaaS admin page renders a tenant provisioning form, usage table with time-range filter, billing status, and suspend/reactivate controls — all wired to Phase 12 APIs
  4. DashboardHeader displays a tier badge (e.g. "MSSP" or "SaaS") adjacent to the product logo — badge is absent on community/starter/pro/enterprise tiers
  5. Any UI element gated to a higher tier that is rendered on a lower-tier deploy shows a TierGate upgrade prompt instead of the feature — no console errors, no blank panels
**Plans**: 2 plans

Plans:
- [ ] 13-01-PLAN.md — TierGate component, tier-conditional sidebar MSSP nav group, tier badge in header (DTIER-01, DTIER-04, DTIER-05)
- [ ] 13-02-PLAN.md — MSSP overview page, cross-tenant detection page, SaaS admin page (DTIER-02, DTIER-03)

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Design & Mockups | N/A | Complete | 2026-03-20 |
| 2. Design System Foundation | 3/3 | Complete | 2026-03-20 |
| 3. Dashboard Pages | 3/3 | Complete | 2026-03-20 |
| 4. Quarantine & Detection | 2/2 | Complete | 2026-03-20 |
| 5. Gap Closure | 0/2 | Not started | - |
| 6. PRH Engine | 0/3 | Not started | - |
| 7. Anomaly Expansion | 0/1 | Not started | - |
| 8. SIEM Connectors | 2/2 | Complete | 2026-03-20 |
| 9. Dashboard Integration | 2/2 | Complete | 2026-03-21 |
| 10. Tier Framework | 0/1 | Not started | - |
| 11. MSSP Multi-Tenant | 0/2 | Not started | - |
| 12. SaaS Management | 0/1 | Not started | - |
| 13. Dashboard Tier-Awareness | 0/2 | Not started | - |

---

*Roadmap created: 2026-03-20*
*v2.0 phases added: 2026-03-20*
*v2.1 phases added: 2026-03-21*
*Last updated: 2026-03-21 — Phase 10-13 Enterprise Tier System added*
*Phase 13 planned: 2026-03-20 — 2 plans created*
