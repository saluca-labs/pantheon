# Roadmap: Tiresias Dashboard UI Redesign

**Milestone:** UI Redesign (Obsidian Flux)
**Granularity:** Coarse
**Coverage:** 37/37 v1 requirements mapped

> Phase 1 (design mockups, Stitch pipeline, design brief) is COMPLETE. Build phases start at 2.

---

## Phases

- [x] **Phase 1: Design & Mockups** - Obsidian Flux design system, Stitch SDK pipeline, 6 screen mockups (COMPLETE)
- [x] **Phase 2: Design System Foundation** - Establish Obsidian Flux tokens, sidebar, and layout shell in the portal codebase (completed 2026-03-20)
- [x] **Phase 3: Dashboard Pages** - Restyle all 6 existing dashboard sections to match Stitch mockups and wire to live API endpoints (completed 2026-03-20)
- [ ] **Phase 4: Quarantine & Detection** - Build two new views (quarantine management and detection feed) and wire to enforcement/detection endpoints

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
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md — Detection nav group in sidebar + Quarantine page (list, detail, quarantine/release actions) (QUAR-01, QUAR-02, QUAR-03, QUAR-04, DATA-06)
- [ ] 04-02-PLAN.md — Detection Feed page (Sigma matches, anomaly indicator strip) (QUAR-05, QUAR-06, DATA-07)

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Design & Mockups | N/A | Complete | 2026-03-20 |
| 2. Design System Foundation | 3/3 | Complete   | 2026-03-20 |
| 3. Dashboard Pages | 3/3 | Complete   | 2026-03-20 |
| 4. Quarantine & Detection | 1/2 | In progress | - |

---

*Roadmap created: 2026-03-20*
*Last updated: 2026-03-20 after Phase 4 planning*
