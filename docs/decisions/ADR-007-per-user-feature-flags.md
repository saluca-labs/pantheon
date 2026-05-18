# ADR-007: Per-User Feature Flags for Agentic OS Modules

> Status: accepted (May 2026, platform/oasis-rollout, Workstream E)

## Context

By the end of the oasis rollout the sidebar shipped nine OS modules.
Internal feedback from early users converged on the same theme: the
sidebar was becoming busy, and not every user cared about every OS.
A "Filmmaker" power user didn't want the CyberSec OS in their face,
and vice-versa.

We needed a way for an individual user to hide modules they don't use
without affecting other users, without requiring an admin step, and
without rebuilding the dashboard.

The decision space had a few axes:

- **Granularity** — per-user, per-org, per-environment, per-module-feature?
- **Authority** — user-self-serve vs. admin-controlled?
- **Default** — opt-in (everything off until flipped on) or opt-out
  (everything on until flipped off)?
- **Trust level** — UX gate or security boundary?
- **Storage** — database row, env var, third-party flag service?

## Decision

Ship per-user, opt-out, user-self-serve, UX-only, database-backed flags.

### Granularity: per-user

`(user_id, os_slug)` is the primary key. No org or environment scoping
in v1. Users are the unit that complained; users are the unit we serve.
Org-level overrides are listed under followups.

### Authority: user-self-serve

A single page at `/dashboard/settings` with a row per OS and a toggle
per row. No admin gate. No approval workflow. Users own their own
sidebar.

### Default: opt-out (`enabled = true` for missing rows)

The migration ships zero rows. The repo seeds every slug to `true` and
then overlays stored values:

```ts
const flags: Record<string, boolean> = {};
for (const slug of ALL_SLUGS) flags[slug] = true;
for (const row of rows) flags[row.os_slug] = row.enabled;
```

This means:

1. Existing users see no behavioral change after deploy.
2. New OSes appearing in the registry are immediately visible to all
   existing users without a backfill.
3. The migration itself is a no-op for the live data plane.

The opt-in alternative (every flag default-false, force every user
through a setup wizard) was rejected as user-hostile and migration-heavy.

### Trust: UX gate, not security boundary

A disabled OS still has fully live BFF routes. The flag controls only:

- Sidebar visibility (the module's nav item)
- Mobile-nav visibility

It does **not** control:

- API access — `/api/tiresias/agentic-os/<slug>/...` continues to respond
- Direct URL access — `/dashboard/os/<slug>` still renders
- Audit row creation
- Database access

This is the most important property of v1: flags are a personal-comfort
feature, not access control. Access control is RBAC on the platform-api
side.

### Storage: Postgres in the same database

```sql
CREATE TABLE agos_feature_flags (
  user_id    UUID    NOT NULL,
  os_slug    TEXT    NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, os_slug)
);
```

No FK on `user_id` (consistent with the rest of `agos_*`). No FK on
`os_slug` (registry is TypeScript-side; see ADR-005).

Migration:
[`0013_agos_feature_flags.py`](../../packages/database/alembic/versions/0013_agos_feature_flags.py),
chained off `0012_filmmaker_projects`.

## Consequences

**Positive:**

- Users get a clean sidebar without coordinating with anyone.
- Adding a new OS Just Works — no backfill needed because the default
  is `true`.
- Toggle is fast: one upsert per change, plus an audit row in
  `agos_audit` (`os_slug = 'flags'`).
- The `try`/`catch` around `getFlags()` in the dashboard layout means a
  flag-store outage degrades to "show everything", not "blank dashboard"
  — flags are purely additive UX.

**Negative / tradeoffs:**

- **Not a security control.** Operators reading "feature flags" might
  assume it gates access. It doesn't, and the docs say so prominently.
  Mistaking it for access control is a real risk.
- **No org-level overrides.** A future ADR will likely layer org flags
  on top, with a precedence rule (org-disabled wins, otherwise user
  decides).
- **No granularity below the OS.** A user can hide Filmmaker but cannot
  hide just "Filmmaker projects" while keeping "Filmmaker shots". The
  unit is the module; sub-page granularity is a future option that
  would force a richer schema.
- **Eventually consistent UI.** Toggling a flag requires a navigation
  to take effect (next request reads the new state). No websocket fan-out.

## Alternatives considered

- **Org-scoped flags only.** Rejected: doesn't address the actual
  feedback, which was per-user clutter not per-org policy.

- **Env-var or build-time flags.** Rejected: requires a redeploy per
  toggle, which is the opposite of self-serve.

- **Third-party flag service** (LaunchDarkly, Statsig, Unleash).
  Rejected for v1: introduces a runtime dependency for what is a
  trivial boolean store, and would require sending user IDs to a
  third party. Reconsider once we have multiple flag use cases beyond
  sidebar visibility.

- **Opt-in default (`enabled = false`)**. Rejected: punishes existing
  users with a setup step on next login, and makes adding a new OS
  silent for the entire user base until each user opts in.

- **Make it a security boundary** (also gate the BFF routes). Rejected
  for v1 to keep the surface small. RBAC remains the access control
  mechanism. If we ever want flag-based enforcement, a route-level
  middleware reading the same table is a small addition.

## Migration / rollback

Forward: `0013_agos_feature_flags` is idempotent (CREATE TABLE IF NOT
EXISTS, etc.) and ships zero rows. Safe to apply on a hot database.

Rollback: drop the table. Sidebar continues to work because
`getFlags()` is wrapped in `try/catch` and the catch path produces
`enabledSlugs = undefined`, which the sidebar interprets as "show
everything". No code path requires the table to exist.

## Followups

- **Org-scoped flags** with a precedence rule (org-disable wins).
- **Per-feature flags within an OS** (hiding individual sub-pages).
- **Admin "force-enabled" flag** for an org admin to lock a particular
  OS visible regardless of user preference.
- **Sticky onboarding hints** — "you disabled Maker, here's how to bring
  it back" UX, since the OS Settings entry is always present in the nav.
