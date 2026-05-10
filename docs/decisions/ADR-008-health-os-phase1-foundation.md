# ADR-008: Health OS Phase 1 — Foundation Layer

> Status: accepted (May 2026, platform/agentic-os, Workstream Health)

## Context

Health OS is the first of nine Agentic OS verticals to receive a
phased build-out. Phase 1 establishes the foundation: schema,
consent, risk-flag substrate, the dashboard hub component, and a
shared crisis-language guard. Subsequent OSes inherit the patterns
introduced here.

The key questions Phase 1 needed to answer:

- Schema strategy — Prisma or raw alembic?
- Naming — should mental-health tables share the existing
  `agos_health_*` prefix or get a separate `agos_mh_*` namespace?
- Crisis-guard scope — block on detection or record-and-continue?
- Where do reusable per-OS primitives live?

## Decision

### Schema: raw alembic, two prefixes

All Phase 1 tables are introduced via
`packages/database/alembic/versions/0014_health_os_phase1.py`, mirroring
the `op.execute(... CREATE TABLE IF NOT EXISTS ...)` style locked in by
`0003_agentic_os.py` and the PR #2 review fix on offline-mode migrations.
No Prisma. A repeat-safe migration is required so first-boot bootstraps
match production replays.

Tables introduced:

- `agos_mh_profile` — mental-health-vertical-only.
- `agos_health_consent` — shared by physical + mental + integrations.
- `agos_health_risk_flag` — shared by every Health OS surface that emits
  signals.

The split is intentional: anything mental-health-specific gets `agos_mh_`,
anything that crosses physical + mental + integrations stays under
`agos_health_`. This mirrors the boundary that consent, audit, and
analytics will draw later — physical-vs-mental is a privacy axis, not
just an organizational one. Future MH-only tables (journal, mood,
coach turns) will land under `agos_mh_*`.

### Crisis-guard: non-blocking by design

`withCrisisGuard()` from
`apps/platform-web/src/lib/agentic-os/_shared/safety/crisis-guard.ts`
wraps free-text BFF endpoints. When the rule-based detector matches a
known crisis phrase, the wrapper:

1. Persists a `crisis-language` risk flag at `critical` severity.
2. Continues the request — no 4xx, no thrown error.

The handler and the persistence run in parallel; persistence failures
are logged but never propagated. The reasoning:

- A user in crisis writing the words "I want to die" must NOT be punished
  by losing their journal entry / intake answer / coach turn. Their data
  belongs to them.
- The flag itself, surfaced on the Health OS hub, is what triggers the
  surface-level safety response (988 / Crisis Text Line CTAs).
- A blocking guard would also create perverse incentives to obfuscate
  (typos, leetspeak) once users learn the trigger.

Hard blocks live elsewhere — for example, the `mh-profile` PUT route
returns 403 if mental-scope consent is absent, and the screener safety
wall (PR #2 era) still gates plan generation when PHQ-9 Q9 ≥ 1.

### Shared library home: `_shared/`

This is the first phase to introduce
`apps/platform-web/src/lib/agentic-os/_shared/` and
`apps/platform-web/src/components/agentic-os/_shared/`. The convention:

- `_shared/types.ts` — cross-OS types (`RiskFlagInput`, `OsContext`).
- `_shared/audit.ts` — slug-parameterized `recordAudit` writer.
- `_shared/safety/crisis-guard.ts` — detector + non-blocking wrapper.
- `_shared/dashboard-hub.tsx` — the features-first hub component now
  used by Health, intended for adoption by every other OS in their
  phase.

Other OSes are not migrated to `_shared/` in this PR; the per-OS
`recordAudit` helpers stay in place until each OS's phase touches its
repo. Phase 1 is intentionally narrow.

## Consequences

- New tables ship behind alembic 0014; no production data is touched on
  upgrade.
- Existing Health crisis-detection callers see no behavior change —
  `lib/agentic-os/health/crisis-detection.ts` re-exports from `_shared/`.
- Other 8 OSes will pick up `DashboardHub` and `_shared/audit` when their
  Phase 1 lands. The `_shared/` directory is now the home for cross-OS
  primitives.
- `med_notes` is plaintext for now — Pantheon does not yet expose a
  column-level KEK helper to the agentic-os tree. Encryption at rest is
  a follow-up; the column is sized (`TEXT`) and named to make the
  migration trivial.

## Open follow-ups (Phase 2+)

- Adopt `_shared/audit.ts` from the other 8 OSes when each is touched.
- Encrypt `med_notes` once the agentic-os tree gets a KEK helper.
- Wire `withCrisisGuard` into the journal + coach endpoints when those
  ship in Phase 2.
- Build the dismiss-flag client UI (the Phase 1 badge surface is
  read-only; the BFF DELETE route is already in place).
