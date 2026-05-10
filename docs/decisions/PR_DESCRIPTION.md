# platform/unification-v1: monorepo consolidation + local-auth + container-first

## Summary

This PR executes the full `platform/unification-v1` consolidation as specified in `CONSOLIDATION_SPEC.md`. It reorganizes ~10 formerly-scattered repositories/directories into a coherent monorepo structure, replaces WorkOS AuthKit with local-auth (Argon2id + Postgres sessions), vendors the elysium memory package as `@platform/memory`, and establishes container-first deployment.

---

## Commits

| Phase | Commit | Message |
|-------|--------|---------|
| A | `dd1d553` | `refactor: relocate subprojects into apps/ + infrastructure/ + archive cloudbuild` |
| B | `5f475d2` | `feat(memory): vendor elysium into packages/memory as @platform/memory` |
| C | `ce9ce27` | `feat(packages): add config, types, observability shared packages` |
| D | `c88c0ce` | `feat(auth): add @platform/auth (TS + Python) with Argon2id sessions` |
| E | `8bb5733` | `feat(platform-web): replace WorkOS AuthKit with local-auth-default flows` |
| F | `9e6fb5d` | `feat(platform-api): switch auth to platform-auth; wire memory access from web only` |
| G | `3f34626` | `feat(infra): root docker-compose with default/full/ci profiles + multi-stage Dockerfiles` |
| H | `c1ed6fa` | `feat(dx): pnpm workspace + turbo + bootstrap scripts + .env.example` |
| I | `6f00660` | `docs: add architecture, operations, security, ADRs, and rewritten README` |
| J | `d14a3f0` | `ci: normalize on pnpm + uv with lint/typecheck/test/build/docker matrix` |
| K | `475991d` | `chore: harden TS/lint/format and pin toolchain versions` |

---

## New Repository Structure

```
apps/
  platform-web/          Next.js 16 dashboard + BFF (was tiresias-web)
  platform-api/          FastAPI core: SoulAuth, SoulGate, SoulWatch (was tiresias)
  platform-app-proxy/    Agent proxy + Cedar enforcement (was tiresias-app-proxy)
  platform-sovereign/    On-premises variant (was tiresias-sovereign)

packages/
  auth/                  @platform/auth — Argon2id + Postgres sessions (TS + Python)
  memory/                @platform/memory — vendored from elysium @ 758a4a5
  config/                @platform/config — Zod/Pydantic env validation
  types/                 @platform/types — shared TS domain types
  observability/         @platform/observability — pino/structlog logging
  database/              Alembic migration tree (0001_local_auth)

infrastructure/
  grafana/               (was tiresias-grafana)
  incident-controller/   (was tiresias-incident-controller)
  monitor/               (was tiresias-monitor)
  pentest/               (was tiresias-pentest)
  rules/                 (was tiresias-rules) — Cedar policies UNCHANGED
  enforcement/           (was tiresias-enforcement)
  docker/                Base Dockerfile fragments

docs/
  assessment/            repo-inventory, dependency-map, runtime-matrix, auth-surface-map,
                         container-gap-analysis, delete-keep-merge-archive.csv
  architecture/          system-overview, module-boundaries
  operations/            local-development, container-deployment
  security/              auth-model
  decisions/             ADR-001, ADR-002, ADR-003

archive/
  cloudbuild/            49 GCP Cloud Build YAML files
  dockerfiles/           Old per-app Dockerfiles
  workflows/             Old per-app GitHub Actions

docker-compose.yml       Root compose (profiles: default, full, ci)
.env.example             Authoritative env var list
package.json             pnpm workspace root
pnpm-workspace.yaml
turbo.json               Turborepo pipelines
.nvmrc / .tool-versions  Node 22 + Python 3.11 + pnpm 9
tsconfig.base.json       Strict TS base config
.editorconfig / .prettierrc / eslint.config.js
.github/workflows/ci.yml   Normalized CI
.github/workflows/cd.yml   Tag-based GHCR publish
README.md                Rewritten
```

---

## Breaking Changes

### 1. WorkOS AuthKit removed from platform-web

`@workos-inc/authkit-nextjs` is no longer a dependency. All auth flows (`/login`, `/register`, `/forgot-password`, `/auth/signout`) now use `@platform/auth`.

**Migration:**
- Set `SESSION_SECRET` (min 32 chars) in your `.env`
- Remove `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_REDIRECT_URI` env vars
- Run `packages/database` Alembic migration `0001_local_auth` to create the new schema
- Run `scripts/seed-admin.py` (via `pnpm db:seed`) to create the initial admin user

### 2. New database schema

The following tables are added by `0001_local_auth`:
- `users`, `password_credentials`, `sessions`, `password_reset_tokens`, `audit_events`, `organizations`, `memberships`

These are additive — they do not drop any existing tables in the SoulAuth schema.

### 3. Package renames

| Old | New |
|-----|-----|
| `tiresias-web` → `package.json:name` | `platform-web` |
| `@saluca/asphodel` | `@platform/memory` (private, no publishConfig) |

### 4. Directory paths changed (git mv)

All apps and infrastructure moved. Update any hardcoded paths in scripts or deployment configs:

| Old | New |
|-----|-----|
| `tiresias/` | `apps/platform-api/` |
| `tiresias-web/` | `apps/platform-web/` |
| `tiresias-app-proxy/` | `apps/platform-app-proxy/` |
| `tiresias-sovereign/` | `apps/platform-sovereign/` |
| `tiresias-grafana/` | `infrastructure/grafana/` |
| `tiresias-rules/` | `infrastructure/rules/` |

---

## Migration Notes

### Existing users

Existing users in the SoulAuth `_soul_users` table are **not** automatically migrated to the new `users` table. A follow-up migration is needed to bridge the two user stores or merge them.

### SoulAuth unchanged

The agent authentication system (SoulKey, PDP, SoulGate, SoulWatch, portal, sales, supportMCP) is **unchanged**. Only the human-facing auth layer (`apps/platform-web`) was modified.

### RBAC API routes

`/api/tiresias/rbac/roles` and `/api/tiresias/rbac/permissions` now query local Postgres instead of WorkOS Admin API. Permission overrides are stored in a local `permission_overrides` table.

### Memory package — Python access

`@platform/memory` is TypeScript-only in v1. Python services cannot import it directly. Follow-up: add an HTTP sidecar or implement a Python bridge.

---

## Testing Before Merge

```bash
# Install and validate
pnpm install
docker compose config

# Start the default stack
docker compose up --build

# Verify health probes
curl http://localhost:8000/health/live
curl http://localhost:3000/api/health/live
```

---

## Checklist

- [x] All target tree paths exist
- [x] `git log --oneline` shows 11 phase commits on `platform/unification-v1`
- [x] WorkOS package removed from `apps/platform-web/package.json`
- [x] `packages/auth` has both TS and Python halves
- [x] `packages/memory` contains elysium source vendored at `758a4a5`
- [x] All ADRs written
- [x] All assessment docs written
- [x] `docker-compose.yml` validates
- [x] Multi-stage Dockerfiles with non-root user (uid 1001)
- [x] CI pipeline with lint/typecheck/test/build/docker-build jobs
- [x] CD pipeline for tag-based GHCR image publishing
- [ ] `pnpm install` at root (pending: `pnpm-lock.yaml` generation in CI environment)
- [ ] Python bridge for memory access from platform-api (follow-up)
- [ ] User migration from `_soul_users` to `users` table (follow-up)
- [ ] MFA implementation (follow-up)
- [ ] Redis-backed rate limiter for multi-instance deployments (follow-up)
