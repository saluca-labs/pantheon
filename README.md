# Pantheon

Governance-First AI-Security — observability, governance, and audit trails for AI agents,
plus the **Agentic OS** layer: nine domain-specific products (Health, Maker, Research,
Secure-Dev, CyberSec, Filmmaker, Autobiographer, Business, Creator) shipped on top of
the shared platform shell.

> Historical note: this codebase was previously known as "Tiresias Platform"; the top-level project has been renamed to Pantheon. Internal `@platform/*` package names and Synapse `tiresias-*` matrix aliases are intentionally preserved.

## Architecture

```
apps/
  platform-web          Next.js 16 dashboard + BFF + Agentic OS layer
  platform-api          FastAPI core (Wave-H agent platform, SoulKey agent
                        auth, federated SoulAuth, PDP, audit log)
  platform-app-proxy    Agent-facing proxy with Cedar policy enforcement
                        (intentionally Tiresias-branded — see app README)
  platform-sovereign    On-premises deployment variant
  soul-service          Vendored Soul memory service (FastAPI)
  soul-mcp              MCP adapter for the Soul tool surface

packages/
  @platform/auth        Legacy local-auth (Argon2id + Postgres sessions).
                        Production user auth is federated through SoulAuth;
                        see docs/operations/soulauth-integration.md.
  @platform/memory      Agent memory (vendored from elysium @ 758a4a5)
  @platform/config      Zod/Pydantic env validation
  @platform/types       Shared TypeScript domain types
  @platform/observability  Structured logging (pino/structlog)
  platform-database     Alembic migration tree

infrastructure/
  grafana               Grafana + Prometheus + Loki stack
  rules                 Cedar policies (do not modify via auth changes)
  enforcement           Policy enforcement point
  monitor / pentest / incident-controller
```

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 22+ |
| pnpm | 9.x (`corepack enable`) |
| Python | 3.11+ |
| uv | latest (`pip install uv`) |
| Docker | 24+ (for container stack) |
| PostgreSQL | 16 (or use Docker) |

> **Windows users: use WSL2.** Native Windows is not supported for local
> development — the bootstrap, alembic, and pytest paths assume POSIX
> semantics. Install WSL2 (Ubuntu 22.04+) via Microsoft's
> [WSL install guide](https://learn.microsoft.com/en-us/windows/wsl/install)
> and run the bash commands below from a WSL shell. A small
> `scripts/bootstrap.ps1` stub will detect non-WSL PowerShell and point
> you at the install docs.

## Local (Non-Container) Setup

```bash
# 1. Clone
git clone <repo-url>
cd pantheon

# 2. Bootstrap — installs deps, creates .venv, copies .env, runs migrations
pnpm bootstrap

# 3. Start all services
pnpm dev
```

- Dashboard: http://localhost:3000
- Cross-OS index: http://localhost:3000/dashboard/os
- Audit log viewer: http://localhost:3000/dashboard/audit
- OS Settings (per-user feature flags): http://localhost:3000/dashboard/settings
- API docs: http://localhost:8000/docs
- Mailhog (email): http://localhost:8025

See [docs/operations/quickstart.md](docs/operations/quickstart.md) for the
15-minute clone-to-running path, or
[docs/operations/local-development.md](docs/operations/local-development.md)
for the full reference.

## Container Setup

```bash
# Copy and configure env
cp .env.example .env

# Start default stack (db + mailhog + platform-api + platform-web)
pnpm docker:up

# Start full stack (adds redis, proxy, sovereign, worker)
docker compose --profile full up --build

# Validate config without starting
docker compose config
```

## Default Dev Credentials

After running `pnpm bootstrap` or `pnpm db:seed` (which invokes `scripts/seed-admin.py`):

| Field | Value |
|-------|-------|
| Email | `admin@local` |
| Password | Printed during seed (random per run) |

## Key Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | — | Min 32 chars; signs session cookies |
| `AUTH_MODE` | No | `local` | `local` or `oidc` |
| `WEB_PUBLIC_URL` | Yes | — | Public URL of platform-web |
| `API_PUBLIC_URL` | Yes | — | Public URL of platform-api |
| `SMTP_HOST` | No | — | SMTP host for password reset emails |
| `LOG_LEVEL` | No | `info` | trace/debug/info/warn/error |

See [.env.example](.env.example) for the full authoritative list.

## Database Migrations

```bash
# packages/database (local-auth schema)
cd packages/database && python -m alembic upgrade head

# apps/platform-api (SoulAuth schema)
cd apps/platform-api && python -m alembic upgrade head

# Or via compose
docker compose exec platform-api python -m alembic upgrade head
```

## Running Tests

```bash
pnpm test                           # all packages
pnpm --filter platform-web test:run  # specific app
cd apps/platform-api && pytest       # Python tests
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `SESSION_SECRET` too short | Must be ≥ 32 chars: `openssl rand -base64 48` |
| `argon2` native build failure | `npm install -g node-gyp`; macOS: `xcode-select --install` |
| DB connection refused | Check `DATABASE_URL` and that PostgreSQL is running |
| pnpm packages not found | Run `pnpm install` from repo root |

## Documentation

**Architecture:**
- [System overview](docs/architecture/system-overview.md)
- [Module boundaries](docs/architecture/module-boundaries.md)
- [Agentic OS](docs/architecture/agentic-os.md) — nine OS modules + cross-OS surfaces
- [Audit log](docs/architecture/audit-log.md) — `agos_audit` schema, viewer, conventions
- [Feature flags](docs/architecture/feature-flags.md) — per-user OS toggles

**Operations:**
- [Quickstart (15 minutes)](docs/operations/quickstart.md)
- [Local development](docs/operations/local-development.md)
- [Container deployment](docs/operations/container-deployment.md)
- [Alembic branches](docs/operations/alembic-branches.md) — migration topology
- [Agents platform quickstart](docs/operations/agents-platform-quickstart.md) — Wave-H agent + prompt + import
- [BYOK provider keys](docs/operations/byok-provider-keys.md) — per-tenant LLM credentials
- [Agents store adapter config](docs/operations/store-adapter-config.md) — LocalPg vs Supabase
- [SoulAuth federated integration](docs/operations/soulauth-integration.md) — production user auth

**Security:**
- [Auth model](docs/security/auth-model.md)

**Decision records:**
- [ADR-001: Topology](docs/decisions/ADR-001-platform-topology.md)
- [ADR-002: Local auth](docs/decisions/ADR-002-local-auth-default.md)
- [ADR-003: Elysium vendoring](docs/decisions/ADR-003-elysium-internal-package.md)
- [ADR-004: Secret management facade](docs/decisions/ADR-004-secret-management-facade.md)
- [ADR-005: Agentic OS module registry](docs/decisions/ADR-005-agentic-os-module-registry.md)
- [ADR-006: Cross-OS audit log](docs/decisions/ADR-006-cross-os-audit-log.md)
- [ADR-007: Per-user feature flags](docs/decisions/ADR-007-per-user-feature-flags.md)

## License

Pantheon is licensed under
[**FSL-1.1-Apache**](LICENSE) — the Functional Source License v1.1 with a
two-year automatic conversion to Apache 2.0 (the same pattern used by
Sentry).

- Free for internal commercial use — consultants, startups, and enterprises
  may run Pantheon for their own operations at no cost.
- Restricts only **Competing Use**: offering Pantheon to third parties as
  a managed/hosted service that substitutes for what we offer.
- Each released version automatically converts to **Apache 2.0** on the
  second anniversary of its first distribution, becoming true OSS.

Contributions are governed by the
[Developer Certificate of Origin](.github/DCO.md) — no CLA. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the sign-off workflow.

The Pantheon name and visual assets are trademarks; see
[TRADEMARKS.md](TRADEMARKS.md) for the trademark policy.

Several subdirectories carry their own licenses where vendored or
historically separate: `infrastructure/rules/` (Sigma rules, Apache-2.0),
`apps/soul-service/` (Apache-2.0), `packages/memory/` (vendored from
saluca-labs/elysium under Apache-2.0). Those files retain their existing
LICENSE headers.
