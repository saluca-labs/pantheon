# Agentic OS Rollout Playbook

> Status: stable as of platform/oasis-rollout (May 2026)

A practical guide to shipping changes to the Agentic OS layer:
adding a new OS, extending an existing OS, and rolling out cross-OS
changes (audit, flags, registry shape) without breaking deployed
environments.

This is the operational companion to:

- [Architecture](../architecture/agentic-os.md)
- [ADR-005 — Module registry](../decisions/ADR-005-agentic-os-module-registry.md)
- [ADR-006 — Audit log](../decisions/ADR-006-cross-os-audit-log.md)
- [ADR-007 — Feature flags](../decisions/ADR-007-per-user-feature-flags.md)
- [Smoke matrix](smoke-matrix.md)

## Three rollout shapes

Most changes fall into one of three patterns. Pick the one that matches
your work before you write the migration.

### A. Add a new OS

Lifecycle: new module, new tables, new routes, new pages.

1. **Migration first.** Add `0NN_<slug>_os.py` chained off the current
   head in `packages/database/alembic/versions/`. Use `CREATE TABLE
   IF NOT EXISTS` so re-runs are safe. Test the upgrade locally and
   in the dual-tree alembic CI job before merging.
2. **Registry entry.** Append to `AGENTIC_OS_MODULES` in
   `apps/platform-web/src/lib/agentic-os/registry.ts`. Status is
   `'preview'` until feature pages exist, then flip to `'live'`.
3. **Plan content.** Drop a markdown file at
   `apps/platform-web/content/agentic-os/<slug>.md`. The shell renders
   this as the landing page.
4. **Repo + session.** `src/lib/agentic-os/<slug>/{repo.ts,session.ts}`.
   Re-export the maker session helper to keep identity resolution
   uniform.
5. **BFF routes.** `src/app/api/tiresias/agentic-os/<slug>/...route.ts`.
   Every write path must call `recordAudit` before returning.
6. **Feature pages.** `src/app/(dashboard)/dashboard/os/<slug>/.../page.tsx`.
7. **UI components.** `src/components/agentic-os/<slug>/...`.
8. **Smoke probe.** Add to `AGENTIC_OS_PROBES` in
   `scripts/smoke-test.py` and to the matrix in
   `.github/workflows/ci.yml`.
9. **Summary entry.** Add the table + count query to
   `src/app/api/tiresias/agentic-os/summary/route.ts`.
10. **Tests.** Repo unit tests; if labels could collide in the sidebar,
    add a regression test there.

Default flag for the new slug is `true` for every existing user (see
[ADR-007](../decisions/ADR-007-per-user-feature-flags.md)) — no
backfill needed.

### B. Extend an existing OS

Lifecycle: new tables/columns under an existing slug, or a new feature
page.

1. **Migration.** ALTER TABLE preferred over a new CREATE; chain off
   the current head. Mark as idempotent (`IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS` where Postgres supports it; otherwise
   wrap in a DO block).
2. **Repo + routes.** Add the new methods/routes alongside the existing
   `repo.ts`.
3. **Audit action names.** New action strings must be stable and
   namespaced (`<slug>.<entity>.<verb>`). Don't reuse existing action
   names with new payload shapes — the audit viewer treats action as
   opaque text and users may have searched on it.
4. **Smoke.** If the new entity is the OS's primary write path,
   consider updating the smoke probe to exercise it; otherwise leave
   the existing probe.

### C. Cross-OS change

Examples: changing the audit cursor codec, modifying the feature-flags
schema, evolving the summary response shape.

1. **Migrate forward only.** Cross-OS schemas are load-bearing. Plan
   for a downgrade only as a rollback option, never as an expected path.
2. **Stage with 404 skip guards.** If the change is additive (new
   endpoint, new field), the smoke harness already handles 404 as a
   skip success — see "Staged rollout safety" below.
3. **Update three places at once.** Architecture doc + ADR + smoke
   harness. Cross-OS changes that ship without ADRs are technical
   debt by definition.

## Staged rollout safety

The smoke harness has 404 short-circuits on every cross-OS step:

```python
if resp.status_code == 404:
    ok("audit.view", "skipping — endpoint not yet deployed")
    return
```

This means a PR can land a new endpoint before all environments have
the migration / route deployed. The matrix still passes on the older
environments because the 404 is treated as a deliberate skip, not a
failure.

Use this for **additive** changes only. Breaking changes (e.g. removing
a field the UI reads) need a two-step flip:

1. Land the new field alongside the old; UI reads new with fallback to old.
2. Wait for full rollout. Land the cleanup PR that drops the old field.

## Migration ordering

Always two trees, always in this order:

```bash
# 1. Local-auth + Agentic OS schemas
cd packages/database && alembic upgrade head

# 2. Platform-API SoulAuth schema
cd apps/platform-api && alembic upgrade head
```

Both `env.py` files read `DATABASE_URL`. Both upgrades are idempotent.

The current head of the local-auth tree is **`0013_agos_feature_flags`**
(see [`docs/operations/alembic-branches.md`](alembic-branches.md) for
the full chain).

## Pre-merge checklist

Before merging any Agentic OS PR:

- [ ] Migration chains off the current head (no parallel forks)
- [ ] Migration is idempotent (`IF NOT EXISTS` on every DDL)
- [ ] All write routes call `recordAudit`
- [ ] Registry entry exists for any new slug
- [ ] Plan content file exists for any new slug
- [ ] Smoke probe added/updated
- [ ] Tests passing locally (`pnpm test --filter platform-web`)
- [ ] CI green at 24/24 — including all 10 smoke matrix jobs
- [ ] Audit / flags 404 short-circuits are tested for the change

## Post-merge checklist

After a merge that touches Agentic OS:

- [ ] Verify the cross-OS index at `/dashboard/os` renders the new card
      (or unchanged cards still render)
- [ ] Check `/dashboard/os/audit` filters work for the new slug
- [ ] Confirm `/dashboard/os/settings` lists the new slug as an
      enable-by-default toggle
- [ ] Tail platform-web logs in production for `recordAudit` warnings —
      a sudden uptick may indicate a route forgot to await the call

## Rollback patterns

### Schema rollback

If a migration broke prod:

```bash
cd packages/database
alembic downgrade -1
```

Then revert the application PR and redeploy. Idempotent migrations
make this safe to repeat.

### UI rollback (without redeploy)

If a flag-controlled UI change is too disruptive, the affected user can
toggle the OS off in `/dashboard/os/settings`. This is a UX-only
escape hatch — see [ADR-007](../decisions/ADR-007-per-user-feature-flags.md).
A platform-wide kill-switch is a follow-up (the per-org flag layer).

### Audit replay

`agos_audit` is append-only at the application layer. To recover from a
bad write that bypassed the audit (e.g. direct SQL hotfix), insert a
manual `agos_audit` row tagged `action = 'manual.<reason>'` so the
operator's intent is recorded. There is no automatic replay tool; the
viewer surfaces the manual entry the same as any other.

## Common pitfalls

- **Forgetting `recordAudit`.** The audit-completeness contract is
  cultural, not enforced by types. PR review checklists must call it
  out for every new write route.
- **Hardcoded slug allowlists.** Anything outside the registry must
  derive its slug list from `AGENTIC_OS_MODULES`. Hardcoded lists drift
  silently.
- **Migration not chained.** Two parallel migration files with the same
  `down_revision` will fail the dual-tree alembic CI job. Always
  `alembic heads` before adding a new revision.
- **Read-only OS in the per-slug matrix.** If a new OS will be
  read-only in smoke, set `expect_nonempty=False` semantics in advance
  by leaving the write probe out of `AGENTIC_OS_PROBES` — the
  harness's `wrote_anything` flag handles the rest.
- **Treating flags as a security boundary.** They aren't.
  ([ADR-007](../decisions/ADR-007-per-user-feature-flags.md).) Use
  RBAC instead.

## Reference

- [Architecture](../architecture/agentic-os.md)
- [Audit log](../architecture/audit-log.md)
- [Feature flags](../architecture/feature-flags.md)
- [Alembic branches](alembic-branches.md)
- [Smoke matrix](smoke-matrix.md)
- [Local development](local-development.md)
