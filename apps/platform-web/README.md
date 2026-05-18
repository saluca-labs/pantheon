# platform-web

Next.js 16 dashboard and BFF for the Tiresias platform. Hosts the operator console, the [Agentic OS](../../docs/architecture/agentic-os.md) layer, and all server-rendered routes that talk to `platform-api`.

## TL;DR

```
src/app/(dashboard)/            UI routes (App Router, RSC by default)
  dashboard/os/                  Agentic OS layer — see below
src/app/api/tiresias/           BFF endpoints (server-only, scoped per OS)
src/lib/agentic-os/             Per-OS server-side helpers (session, repo, audit)
src/components/agentic-os/      Per-OS client UI components
content/agentic-os/             Per-OS execution plans (markdown, rendered by plan-viewer)
```

License: MIT — internal package, do not publish.

## Surface Map

### Public routes

| Route | Purpose |
|-------|---------|
| `/` | Marketing landing |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Local-auth flows ([packages/auth](../../packages/auth)) |
| `/dashboard` | Operator home |
| `/dashboard/providers` | Connected providers |
| `/dashboard/settings`, `/dashboard/settings/members` | Account / org settings |

### Agentic OS routes

The Agentic OS layer is a registry-driven sub-app under `/dashboard/os/*`. See [docs/architecture/agentic-os.md](../../docs/architecture/agentic-os.md) for the full topology and [ADR-005](../../docs/decisions/ADR-005-agentic-os-module-registry.md) for the registry decision.

| Route | Purpose |
|-------|---------|
| `/dashboard/os` | Cross-OS index with live counts |
| `/dashboard/audit` | Cross-OS audit log viewer ([ADR-006](../../docs/decisions/ADR-006-cross-os-audit-log.md)) |
| `/dashboard/settings` | Per-user feature flags ([ADR-007](../../docs/decisions/ADR-007-per-user-feature-flags.md)) |
| `/dashboard/os/[slug]` | Generic plan viewer for any registered slug |
| `/dashboard/os/<slug>/...` | Per-OS feature surfaces (e.g. `/dashboard/maker/builds`, `/dashboard/filmmaker/projects`) |

Modules registered in `src/lib/agentic-os/registry.ts`: `health`, `maker`, `research`, `secure-dev`, `creator`, `filmmaker`, `cyber`, `autobiographer`, `business`.

### BFF endpoints

All under `src/app/api/tiresias/agentic-os/`:

| Path | Method | Purpose |
|------|--------|---------|
| `summary` | GET | Cross-OS dashboard counts |
| `audit` | GET | Cursor-paginated `agos_audit` reads |
| `flags` | GET, POST | Per-user feature flag read/write |
| `<slug>/...` | varies | Per-OS reads and write probes |

Per-OS endpoints follow the pattern `tiresias/agentic-os/<slug>/<resource>`. Every write appends to `agos_audit` ([docs/architecture/audit-log.md](../../docs/architecture/audit-log.md)).

## Adding a New OS

Single-file walk-through in [docs/architecture/agentic-os.md](../../docs/architecture/agentic-os.md#adding-a-new-os). Short version:

1. Add a row to `src/lib/agentic-os/registry.ts`
2. Drop a plan markdown at `content/agentic-os/<slug>.md`
3. Add `src/lib/agentic-os/<slug>/session.ts` re-exporting from `../health/session`
4. (Optional) Add feature pages under `src/app/(dashboard)/dashboard/os/<slug>/`
5. (Optional) Add BFF routes under `src/app/api/tiresias/agentic-os/<slug>/`
6. Add a smoke job in `.github/workflows/ci.yml` ([docs/operations/smoke-matrix.md](../../docs/operations/smoke-matrix.md))

## Local Development

See [docs/operations/local-development.md](../../docs/operations/local-development.md) for the full bootstrap.

```bash
pnpm install
pnpm --filter platform-web dev
# UI on http://localhost:3000
```

The Agentic OS layer needs migrations through `0013` to be live — see [docs/operations/alembic-branches.md](../../docs/operations/alembic-branches.md).

## Tests, Type Checking, Lint

```bash
pnpm --filter platform-web test:run
pnpm --filter platform-web typecheck
pnpm --filter platform-web lint
```

Smoke tests live under `.github/workflows/ci.yml` and are documented in [docs/operations/smoke-matrix.md](../../docs/operations/smoke-matrix.md).

## See Also

- [docs/architecture/agentic-os.md](../../docs/architecture/agentic-os.md) — full Agentic OS topology
- [docs/architecture/audit-log.md](../../docs/architecture/audit-log.md) — `agos_audit` schema and cursor codec
- [docs/architecture/feature-flags.md](../../docs/architecture/feature-flags.md) — opt-out flag resolution
- [docs/security/auth-model.md](../../docs/security/auth-model.md) — session helpers and `audit_events` vs `agos_audit`
- [docs/operations/agentic-os-rollout.md](../../docs/operations/agentic-os-rollout.md) — staged rollout playbook
