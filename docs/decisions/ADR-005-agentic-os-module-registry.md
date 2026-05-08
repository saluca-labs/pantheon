# ADR-005: Agentic OS Module Registry as Single Source of Truth

> Status: accepted (May 2026, platform/oasis-rollout)

## Context

The Agentic OS layer ships nine domain-specific products (Health, Maker,
Research, Secure-Dev, CyberSec, Filmmaker, Autobiographer, Business,
Creator) on top of `apps/platform-web`. Each module has its own:

- Sidebar entry (label, icon, status badge)
- Cross-OS dashboard card (`/dashboard/os`)
- Landing/plan page (`/dashboard/os/[slug]`)
- Feature pages (`/dashboard/os/<slug>/<page>`)
- BFF routes (`/api/tiresias/agentic-os/<slug>/...`)
- Marketing copy (tagline, accent color, description)
- Plan content file (rendered into the landing page)

During the Phase-3 rollout (PRs #4–#7) we initially duplicated this
metadata across:

- A hardcoded sidebar `agenticOsItems` array
- A hardcoded `/dashboard/os` index `osCards` array
- A hardcoded `osMetadata` object inside `/dashboard/os/[slug]` for hero
  rendering
- The smoke-test `AGENTIC_OS_PROBES` map
- The `/api/.../summary` route's per-OS query block

Adding the eighth OS (Business, in PR #5) required edits to five separate
files just to make the new module *exist* in the UI. Three of the five
edits were trivial copy-paste; one was missed and shipped a broken
sidebar entry that pointed to a 404. The pattern was unsustainable.

## Decision

Introduce a **single registry** at
[`apps/platform-web/src/lib/agentic-os/registry.ts`](../../apps/platform-web/src/lib/agentic-os/registry.ts)
that owns the canonical `AgenticOsModule[]`. All UI surfaces read from it.
BFF and database surfaces read from it for slug validation.

```ts
export interface AgenticOsModule {
  slug: string;
  label: string;
  shortName: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  status: 'live' | 'preview' | 'planned';
  planFile: string;        // relative to apps/platform-web/content/agentic-os/
  accent: string;          // tailwind color name
}

export const AGENTIC_OS_MODULES: AgenticOsModule[] = [/* 9 entries */];
```

Consumers:

| Consumer                                | Reads                       |
| --------------------------------------- | --------------------------- |
| `components/layout/sidebar.tsx`         | label, slug, icon, status   |
| `components/layout/mobile-nav.tsx`      | label, slug, icon, status   |
| `app/(dashboard)/dashboard/os/page.tsx` | label, tagline, description, accent, status |
| `app/(dashboard)/dashboard/os/[slug]/page.tsx` | label, planFile      |
| `lib/agentic-os/audit/repo.ts`          | slugs (allowlist for filter validation) |
| `lib/agentic-os/flags/repo.ts`          | slugs (default-true seeding) |
| `app/api/.../summary/route.ts`          | slugs (parallel query map)  |

The smoke-test harness retains its own `AGENTIC_OS_PROBES` map because it
holds *additional* metadata (write payloads, params, verify mode) that
isn't useful in the UI. Adding a new OS still requires a smoke probe
entry, but it's the only place outside the registry that needs to know
about a new slug.

## Consequences

**Positive:**

- Adding a new OS is now a single-file edit in `registry.ts` for all UI
  surfaces. The remaining work (route shell, BFF, migration, smoke) is
  per-OS by definition and can't be deduplicated.
- Sidebar status badges (`Preview`, `Soon`) follow the registry's `status`
  field automatically — no risk of the badge drifting from the actual
  feature state.
- Per-user feature flags (ADR-007) and the audit slug allowlist (ADR-006)
  share the same source, eliminating "is `business-os` valid here?" drift.
- The cross-OS `/dashboard/os` index is derived, not authored — copy
  changes happen in one place.

**Negative / tradeoffs:**

- The registry is imported into both server and client trees. Lucide icons
  carry a small bundle cost; this is mitigated by Next.js tree-shaking
  per-route imports.
- The `accent` field is a tailwind class name string, not a typed value.
  Mistakes there fail silently at runtime (no badge color). This is
  documented in the per-OS content guide and caught by visual review.
- The `planFile` field is a string filename, not a strongly-typed import.
  A missing file produces a runtime "plan unavailable" fallback rather
  than a build error. Acceptable because plan files are routinely edited
  by content authors who don't run a TS type check.

## Alternatives considered

- **Codegen registry from migrations.** Considered: derive slugs from the
  Alembic migration filenames. Rejected: registry needs richer metadata
  (icons, taglines, accents) that has no business living in SQL DDL.

- **One registry per surface.** Status quo from Phase 3. Rejected: the
  duplication caused the bug that motivated this ADR.

- **Database-backed registry.** Considered: store modules in a
  `agos_modules` table editable by ops. Rejected for now: modules carry
  React component references (Lucide icons), which can't live in the
  database. Could revisit if we ever ship runtime module loading.

- **Plug-in style (`registerModule(...)` calls).** Considered: have each
  OS package self-register at import time. Rejected: import-order
  fragility (the import happens once Next.js evaluates the file, which
  may not be deterministic across server/client trees).

## Migration / rollback

The registry was added in PR #4 with the first three modules. PRs #5–#6
added the remaining six. No data migration required. Rolling back the
registry to per-surface arrays is mechanically straightforward but
loses the integrity guarantees called out above.

## Followups

- **Module discovery for agents.** When SoulKey-authenticated agents start
  consuming the OS routes, expose the registry via a public
  `/api/tiresias/agentic-os/modules` endpoint so an agent can introspect
  what's available without scraping the UI.
- **Per-org overrides.** Allow an org admin to mark an OS as "hidden for
  our org" — a layer on top of ADR-007 user flags. Likely a column on
  the existing `organizations` table, not a new registry concept.
