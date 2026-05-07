---
phase: 17-aletheia-dashboard-tier-gating
plan: 01
subsystem: portal
tags: [aletheia, dashboard, tier-gating, ui]
dependency_graph:
  requires: [phase-14-tool-monitoring, phase-15-tool-policies, phase-16-cot-intercept]
  provides: [aletheia-dashboard-ui, aletheia-tier-gating-verification]
  affects: [DashboardSidebar, DashboardHeader]
tech_stack:
  added: []
  patterns: [TierGate-wrapper, useWidgetData-hook, css-div-charts, obsidian-flux-tokens]
key_files:
  created:
    - portal/src/app/dashboard/aletheia/page.tsx
    - portal/src/app/dashboard/aletheia/cot-audit/page.tsx
    - portal/src/app/dashboard/aletheia/tool-activity/page.tsx
    - portal/src/app/dashboard/aletheia/sanitizer/page.tsx
    - portal/src/app/dashboard/aletheia/policies/page.tsx
  modified:
    - portal/src/components/dashboard/DashboardSidebar.tsx
    - portal/src/components/dashboard/DashboardHeader.tsx
decisions:
  - "Aletheia sidebar group inserted between security and soulwatch groups for logical flow"
  - "All 5 pages use TierGate enterprise wrapper to block sub-enterprise access"
  - "Aletheia header indicator uses useWidgetData with 60s refresh to avoid excessive polling"
metrics:
  duration: "13m"
  completed: "2026-03-21T23:04:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 2
  total_lines_added: 1338
requirements: [ALETH-13, ALETH-14]
---

# Phase 17 Plan 01: Aletheia Dashboard Pages + Tier Gating Summary

Aletheia dashboard UI with 5 pages (Overview, CoT Audit, Tool Activity, Sanitizer, Policy Editor) gated to enterprise+ tiers via TierGate wrapper and backend FeatureGateMiddleware verification.

## ALETH-13: Tier Gating Verification

Verified via code inspection of `src/middleware/feature_gate.py`:

| Feature Key | Min Tier | Route |
|---|---|---|
| aletheia_cot_intercept | enterprise | /v1/aletheia/* |
| aletheia_cot_content_storage | enterprise | /v1/aletheia/* |
| aletheia_cot_proof_export | enterprise | /v1/aletheia/* |
| aletheia_tool_monitoring | enterprise | /v1/aletheia/* |
| aletheia_response_sanitizer | enterprise | /v1/aletheia/* |
| aletheia_tool_policies | enterprise | /v1/aletheia/tool/* |
| aletheia_dashboard | enterprise | /v1/aletheia/* |

All `/v1/aletheia/*` endpoints return 402 for community/starter/pro tiers. MSSP-specific features (cross-tenant CoT audit, managed tool policies) gated to mssp tier.

## ALETH-14: Dashboard Implementation

### Sidebar + Header (Task 1)

- Added `aletheia` group to DashboardSidebar with 5 nav items (Overview, CoT Audit, Tool Activity, Sanitizer, Policies)
- Group renders between security and soulwatch when `tierMeets(tier, "enterprise")` is true
- Imported lucide icons: Eye, Link2, Terminal, ShieldCheck, FileCode
- DashboardHeader: added 5 PAGE_TITLES entries + Aletheia status indicator (green/grey dot)
- Status indicator fetches `/v1/aletheia/cot/chain?limit=1` at 60s interval, skipped for non-enterprise tiers

### Dashboard Pages (Task 2)

| Page | Path | Widgets | Lines |
|---|---|---|---|
| Overview | /dashboard/aletheia | CoT chain health, tool timeline, sanitizer verdicts, policy violations | 247 |
| CoT Audit | /dashboard/aletheia/cot-audit | Chain entries table, verify chain, export proof, content viewer | 224 |
| Tool Activity | /dashboard/aletheia/tool-activity | Invocation timeline, command frequency, agent heatmap, deny/block log | 251 |
| Sanitizer | /dashboard/aletheia/sanitizer | Verdict distribution, pattern frequency, blocked response forensics | 252 |
| Policy Editor | /dashboard/aletheia/policies | YAML editor, evaluation simulator, recent evaluations | 283 |

All pages follow existing patterns: "use client", TierGate wrapper, useWidgetData with 30s refresh, CSS-div charts (no chart library), Obsidian Flux tokens, loading skeletons, empty states.

## Commits

| Hash | Message |
|---|---|
| 987b0e7 | feat(17-01): add Aletheia sidebar nav group + header status indicator |
| 49a9cf9 | feat(17-01): create 5 Aletheia dashboard pages with tier gating |

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None. All pages are fully wired to backend API endpoints via useWidgetData. No placeholder data or TODO markers.

## Pre-existing Issues

Two pre-existing TypeScript errors in DashboardSidebar.tsx (lines 536, 560) -- empty `className={}` expressions in the Support link section. These existed before this plan and are not caused by any changes here.

## Self-Check: PASSED

- [x] portal/src/app/dashboard/aletheia/page.tsx exists (247 lines)
- [x] portal/src/app/dashboard/aletheia/cot-audit/page.tsx exists (224 lines)
- [x] portal/src/app/dashboard/aletheia/tool-activity/page.tsx exists (251 lines)
- [x] portal/src/app/dashboard/aletheia/sanitizer/page.tsx exists (252 lines)
- [x] portal/src/app/dashboard/aletheia/policies/page.tsx exists (283 lines)
- [x] All pages have TierGate requiredTier="enterprise"
- [x] Commit 987b0e7 exists
- [x] Commit 49a9cf9 exists
- [x] TypeScript compiles with only pre-existing errors
