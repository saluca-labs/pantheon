# Feature Flags

> Status: live as of platform/oasis-rollout (May 2026, Workstream E)
> Related ADR: [ADR-007 — Per-user feature flags](../decisions/ADR-007-per-user-feature-flags.md)

Per-user boolean toggles that gate Agentic OS modules in the navigation.
Feature flags are a UX-layer convenience, not a security boundary — see
"What flags do not do" below.

## TL;DR

```
agos_feature_flags(user_id, os_slug, enabled, updated_at)
                                                   ↑
                                                   default: true
                                                   missing row ⇒ enabled

apps/platform-web/src/lib/agentic-os/flags/
├── repo.ts        getFlags(userId) → Record<slug, boolean>
│                  setFlag(userId, slug, enabled)
│                  recordFlagsAudit(args)
├── server.ts      getEnabledModules(userId), isOsEnabled(userId, slug)
└── session.ts     re-exports getCurrentFlagsUser, getFlagsPool

apps/platform-web/src/app/api/tiresias/agentic-os/flags/route.ts
   GET  → { flags: Record<slug, boolean> }
   PUT  → { slug, enabled }       (also records an audit row)

apps/platform-web/src/app/(dashboard)/dashboard/os/settings/page.tsx
   Toggle UI; calls PUT for each change

apps/platform-web/src/app/(dashboard)/layout.tsx
   Resolves enabledSlugs server-side, passes into Sidebar + MobileNav
```

## Storage

Migration
[`0013_agos_feature_flags`](../../packages/database/alembic/versions/0013_agos_feature_flags.py)
creates the table:

```sql
CREATE TABLE IF NOT EXISTS agos_feature_flags (
  user_id    UUID    NOT NULL,
  os_slug    TEXT    NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, os_slug)
);

CREATE INDEX IF NOT EXISTS agos_feature_flags_user_idx
    ON agos_feature_flags (user_id);
```

Key properties:

- **No FK on `user_id`.** Same convention as the rest of the agos_* tables;
  user lifecycle is managed by `@platform/auth`, not the OS layer.
- **No FK on `os_slug`.** The slug is a string-typed reference into the
  registry; ordering of registry changes vs. migrations is intentional
  (registry adds first, table backfills lazily).
- **Default TRUE.** A user with no rows is fully enabled. The migration
  ships zero rows.

## Default semantics: opt-out, not opt-in

Missing rows are treated as `enabled = true`. This means:

- Existing users see no behavioral change after the migration deploys.
- New OSes appearing in the registry are immediately visible to all users
  without any backfill — the absence of a row maps to "enabled".
- A user can disable an OS, and it stays disabled until they re-enable it
  (or until that user record is deleted, which cascades nothing here
  because there's no FK).

Re-running the migration is a no-op (idempotent DDL).

## API

[`GET /api/tiresias/agentic-os/flags`](../../apps/platform-web/src/app/api/tiresias/agentic-os/flags/route.ts)

```json
{
  "flags": {
    "health":         true,
    "maker":          true,
    "research":       false,
    "secure-dev":     true,
    "cyber":          true,
    "filmmaker":      true,
    "autobiographer": true,
    "business":       true,
    "creator":        true
  }
}
```

The map always contains every slug from `AGENTIC_OS_MODULES`, regardless of
whether a row exists in the table. This is what makes the UI deterministic.

[`PUT /api/tiresias/agentic-os/flags`](../../apps/platform-web/src/app/api/tiresias/agentic-os/flags/route.ts)

```json
// Request
{ "slug": "research", "enabled": false }

// Response
{ "ok": true, "slug": "research", "enabled": false }
```

Side effects:

1. Upsert into `agos_feature_flags` with `updated_at = now()`.
2. Insert a row into `agos_audit` with `os_slug = 'flags'`,
   `action = 'flags.toggle'`, and a payload of `{ slug, enabled }`.
3. The Sidebar and the cross-OS dashboard observe the new value on the
   next page navigation (no live websocket).

Validation: unknown slugs return `400 Bad Request` and never write.
Invalid bodies (missing `slug` or non-boolean `enabled`) return `400`.

## Server-side resolution

[`(dashboard)/layout.tsx`](../../apps/platform-web/src/app/(dashboard)/layout.tsx)
calls `getFlags(userId)` once per request, derives the enabled slug list,
and passes it into both the desktop `Sidebar` and the `MobileNav`:

```tsx
let enabledSlugs: string[] | undefined;
try {
  const user = await getCurrentMakerUser();
  if (user) {
    const flags = await getFlags(user.id);
    enabledSlugs = Object.entries(flags)
      .filter(([, on]) => on)
      .map(([slug]) => slug);
  }
} catch {
  // If the flags table is missing or query fails, fall through with
  // enabledSlugs=undefined → sidebar shows everything.
  enabledSlugs = undefined;
}
```

The `try` / `catch` is deliberate: feature flags are a UX nicety, not a
security boundary, and a flag resolution failure must never block the
dashboard from loading. A flag-store outage degrades to "show everything",
not "show nothing".

## Sidebar filtering

[`agenticOsNavItems(enabledSlugs?: string[])`](../../apps/platform-web/src/components/layout/sidebar.tsx):

- If `enabledSlugs` is `undefined` (resolution failed or layout omitted the
  prop), all modules render.
- If `enabledSlugs` is `[]`, no module entries render.
- If `enabledSlugs` is a list, only modules whose slug is in the list render.
- **`Audit log` and `OS Settings` are always appended**, regardless of
  flag state. Both are cross-OS and must remain reachable so a user can
  re-enable the OSes they disabled.

The same logic is mirrored in `mobile-nav.tsx`.

## What flags do NOT do

- **Not a security boundary.** A disabled OS still has live BFF routes; a
  determined client can hit `/api/tiresias/agentic-os/<slug>/...` directly
  and get a real response. Use RBAC + `validateSession` for actual access
  control.
- **Not org-scoped.** Flags live per `user_id`. Org/tenant-scoped flag
  stores are a follow-up.
- **Not granular below "OS".** There is no flag for "Filmmaker projects
  page only"; the unit is the module.
- **Not real-time.** Toggling a flag updates on the next navigation. There
  is no websocket fan-out and no service-worker invalidation.
- **Not exposed to agents.** SoulKey-authenticated agent traffic does not
  read this table.

## Audit trail

Every PUT writes to `agos_audit`:

| Column     | Value                          |
| ---------- | ------------------------------ |
| os_slug    | `'flags'`                      |
| action     | `'flags.toggle'`               |
| actor_id   | `currentUser.id`               |
| project_id | `null`                         |
| payload    | `{ slug, enabled, prev?: bool }` |
| created_at | `now()`                        |

The viewer at `/dashboard/os/audit` filters on `os_slug = 'flags'` to show
the user's flag history.

## Tests

- [`src/__tests__/agentic-os/flags/repo.test.ts`](../../apps/platform-web/src/__tests__/agentic-os/flags/repo.test.ts)
  — 12 tests covering defaults, upsert behavior, unknown-slug rejection,
  audit recording.
- [`src/__tests__/layout/sidebar.test.tsx`](../../apps/platform-web/src/__tests__/layout/sidebar.test.tsx)
  — sidebar regression tests including filter behavior and the always-on
  Audit log + OS Settings entries.

## Smoke

[`step_flags_roundtrip`](../../scripts/smoke-test.py) runs after the
per-OS probes in every CI smoke job:

1. `GET /api/.../flags` → expect `200` + every slug present
2. `PUT /api/.../flags` to disable one slug → expect `200`
3. `GET` again → expect that slug now `false`
4. `PUT` to restore → expect `200`
5. `GET` again → expect restored

A `404` from any step short-circuits with a "skipping — endpoint not yet
deployed" success, so smoke matrices on older deploys keep passing during
staged rollout.
