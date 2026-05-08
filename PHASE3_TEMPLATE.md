# Phase 3 — Per-OS rollout template

Use Health OS at commit `e9d79c9` (PR #4) as the template. Every OS produces
the same shape:

## Files to create (replace `<slug>` with your OS slug, `<Slug>` PascalCase)

```
apps/platform-web/src/lib/agentic-os/<slug>/
  ├─ session.ts           — re-export getCurrentHealthUser pattern; rename to getCurrent<Slug>User
  ├─ repo.ts              — pg-backed CRUD for the OS's primary entities
  └─ <slug-specific>.ts   — domain logic (e.g. screeners.ts for Health, breakdowns.ts for Filmmaker)

apps/platform-web/src/components/agentic-os/<slug>/
  └─ <SlugFeature>.tsx    — at least one client component for the headline feature

apps/platform-web/src/app/(dashboard)/dashboard/os/<slug>/
  └─ <feature>/page.tsx   — server component(s) for the OS's primary feature

apps/platform-web/src/app/api/tiresias/agentic-os/<slug>/
  └─ <resource>/route.ts  — at least one GET + one POST/PUT route

apps/platform-web/src/__tests__/agentic-os/<slug>/
  └─ *.test.ts            — pure-logic tests for any scoring/parsing/validation helper
```

## Schema migration

Add `0004_<slug>_os.py` (or 0004 + sequential per OS) extending revision
`0003_agentic_os`. Add `agos_<slug>_*` tables with idempotent `CREATE TABLE IF
NOT EXISTS`. Use `agos_projects` / `agos_entities` for generic data when a
custom table isn't needed.

Note: parallel branches all start with down_revision = `0003_agentic_os`.
This produces a multi-head alembic graph. The Phase 3 merge order should
re-target each migration to chain off the previous one (rename revision
strings) at PR-merge time — this is a one-line change per migration.

## Registry update

Flip your slug from `'preview'` to `'live'` in
`apps/platform-web/src/lib/agentic-os/registry.ts`. Add tagline-specific
sub-nav links inside `apps/platform-web/src/app/(dashboard)/dashboard/os/[slug]/page.tsx`
following the Health OS pattern.

## Required principles

- License compliance: only MIT/Apache/public-domain code copied. Cite each
  source borrowed in a top-of-file JSDoc.
- No hallucinated facts: every recommendation, calculation, or guideline
  cites a public source URL.
- Standing rules from your OS's execution plan (`apps/platform-web/content/agentic-os/<slug>.md`)
  are enforced at the schema, route, or UI layer — not just documented.
- All API routes session-authenticate via `getCurrentHealthUser` pattern.
- All audit-relevant actions write to `agos_audit` with `os_slug='<slug>'`.

## Tests

- Unit-test pure-logic helpers (parsers, scorers, generators).
- Update `apps/platform-web/src/__tests__/layout/sidebar.test.tsx` only if
  needed (the registry-driven test already covers any added module).

## Deliverable

Each subagent ends with a green PR against main, body listing files added
+ tests + license attestations.
