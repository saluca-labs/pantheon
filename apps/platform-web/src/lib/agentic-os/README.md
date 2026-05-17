# `lib/agentic-os/` — Server-Side Helpers

Server-only code that powers the [Agentic OS](../../../../../docs/architecture/agentic-os.md) layer. Imported by per-OS BFF routes (`src/app/api/tiresias/agentic-os/`) and by RSC pages under `src/app/(dashboard)/dashboard/os/`.

## Layout

```
registry.ts             Single source of truth for which OS modules exist
audit/                  agos_audit reads + auth helper for the cross-OS viewer
flags/                  agos_feature_flags read/write
health/                 Canonical session helper — every other slug re-exports from here
maker/, filmmaker/, cyber/, …   Per-OS repo + session + (optional) inventory helpers
```

## Conventions

### Session helpers

Every per-OS folder has a `session.ts` that re-exports `getCurrentHealthUser` and `getHealthPool` from `health/session.ts` under OS-specific names. This keeps call sites readable (`getCurrentMakerUser`, `getCurrentAuditUser`) while the validation path stays in one place. See [docs/security/auth-model.md](../../../../../docs/security/auth-model.md#agentic-os-session-helpers).

When adding a new OS:

```ts
// src/lib/agentic-os/<slug>/session.ts
export {
  getCurrentHealthUser as getCurrent<Slug>User,
  getHealthPool as get<Slug>Pool,
} from '../health/session';
export type { HealthSessionUser as <Slug>SessionUser } from '../health/session';
```

### Repos

Per-OS data access lives in `<slug>/repo.ts`. Repos:

- Take a `Pool` (or pool-providing helper) — never read env vars directly.
- Return plain objects, not framework types.
- Append to `agos_audit` on writes via `audit/repo.ts` (or the per-OS thin wrapper). See [docs/architecture/audit-log.md](../../../../../docs/architecture/audit-log.md).

### Registry

`registry.ts` is the single source of truth for which OS modules exist. The sidebar, the dynamic plan viewer (`/dashboard/os/[slug]`), the cross-OS index summary, and the feature flag UI all read from this list. Adding an OS is a one-row change here plus the slug-specific feature code. See [ADR-005](../../../../../docs/decisions/ADR-005-agentic-os-module-registry.md).

### Feature flags

`flags/repo.ts` resolves opt-out feature flags from `agos_feature_flags` server-side per request. See [docs/architecture/feature-flags.md](../../../../../docs/architecture/feature-flags.md) and [ADR-007](../../../../../docs/decisions/ADR-007-per-user-feature-flags.md).

## License

MIT — internal. No new third-party deps; helpers reuse `pg`, `next/headers`, and the `@platform/auth` validation chain.
