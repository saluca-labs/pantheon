# Local Development (Non-Container)

This guide covers running the platform services directly on your machine without Docker.

> **Windows users: WSL2 only.** Native Windows shells (cmd, PowerShell)
> are not supported. Install WSL2 with Ubuntu 22.04+ via Microsoft's
> [WSL install guide](https://learn.microsoft.com/en-us/windows/wsl/install)
> and run all commands below from inside the WSL shell. A
> `scripts/bootstrap.ps1` stub exists only to redirect you there.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22.x | `nvm install 22` |
| pnpm | 9.x | `corepack enable && corepack prepare pnpm@9.12.0 --activate` |
| Python | 3.11.x or 3.12.x | `pyenv install 3.11.10` (Linux/macOS/WSL) |
| uv | latest | `pip install uv` or `curl -Ls https://astral.sh/uv/install.sh \| sh` |
| PostgreSQL | 16.x | `brew install postgresql@16` or Docker: `docker run -p 5432:5432 -e POSTGRES_PASSWORD=platform postgres:16-alpine` |
| Mailhog | optional | `brew install mailhog` or Docker (see below) |

Use `.tool-versions` with [asdf](https://asdf-vm.com/) to pin all versions automatically.

## Quick Start

```bash
# 1. Clone and enter repo
cd /path/to/pantheon

# 2. Bootstrap (installs deps, copies .env, runs migrations, seeds admin)
pnpm bootstrap
# This runs scripts/bootstrap.sh

# 3. Start all services in parallel
pnpm dev
```

## Step-by-Step

### 1. Environment

```bash
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and SESSION_SECRET
```

### 2. Install Node.js dependencies

```bash
pnpm install
```

### 3. Install Python dependencies

All Python packages install into a single repo-root virtualenv via `uv`.
Prefer `pnpm bootstrap` (which runs `scripts/bootstrap.sh`) — these
manual commands match what the bootstrap does:

```bash
# Create + activate venv
python3 -m venv .venv
source .venv/bin/activate

# Install all five shared Python packages (editable)
uv pip install -e packages/secrets/python
uv pip install -e packages/config/python
uv pip install -e packages/observability/python
uv pip install -e packages/auth/python
uv pip install -e packages/memory-client/python

# Install platform-api (editable + runtime requirements)
uv pip install -e apps/platform-api
uv pip install -r apps/platform-api/requirements.txt

# Install database package (provides alembic CLI helpers)
uv pip install -e packages/database
```

### 4. Database setup

Start PostgreSQL (if not already running):
```bash
# Docker one-liner for local Postgres:
docker run -d --name pantheon-db \
  -p 5432:5432 \
  -e POSTGRES_USER=platform \
  -e POSTGRES_PASSWORD=platform \
  -e POSTGRES_DB=platform \
  postgres:16-alpine
```

Run migrations:
```bash
# packages/database Alembic (local-auth schema)
cd packages/database
python -m alembic upgrade head
cd ../..

# apps/platform-api Alembic (SoulAuth schema)
cd apps/platform-api
python -m alembic upgrade head
cd ../..
```

### 5. Seed admin user

```bash
# Creates admin@local with a randomly generated password
./.venv/bin/python scripts/seed-admin.py
```

### 6. Start services

**platform-api (FastAPI)**:
```bash
cd apps/platform-api
uvicorn src.main:app --reload --port 8000
```

**platform-web (Next.js)**:
```bash
cd apps/platform-web
pnpm dev   # starts on :3000 with Turbopack
```

**Mailhog** (optional, for password reset emails):
```bash
mailhog   # UI at http://localhost:8025
```

## Development URLs

| Service | URL |
|---------|-----|
| platform-web (Dashboard) | http://localhost:3000 |
| platform-api (FastAPI docs) | http://localhost:8000/docs |
| Mailhog UI | http://localhost:8025 |
| Agentic OS index | http://localhost:3000/dashboard/os |
| Cross-OS audit log | http://localhost:3000/dashboard/audit |
| Per-user OS settings (flags) | http://localhost:3000/dashboard/settings |

Per-OS plan pages live at `/dashboard/os/<slug>` for every slug registered in `apps/platform-web/src/lib/agentic-os/registry.ts` (e.g. `/dashboard/maker`, `/dashboard/filmmaker`).

## Agentic OS Local Development

The Agentic OS layer (see [docs/architecture/agentic-os.md](../architecture/agentic-os.md)) ships enabled-by-default for every signed-in user. After running migrations through `0013` you can:

```bash
# Migrations bring up agos_audit (0003) and agos_feature_flags (0013)
cd apps/platform-api && python -m alembic upgrade head && cd ../..

# Visit the dashboard — every OS module is enabled by default
open http://localhost:3000/dashboard/os
```

### Toggling feature flags locally

There is no seeding step — `agos_feature_flags` is opt-out. To disable an OS for your dev user, either:

1. Use the UI at `/dashboard/settings` (recommended), or
2. Insert a row directly:

```sql
INSERT INTO agos_feature_flags (user_id, os_slug, enabled)
VALUES ('<your-user-id>', 'filmmaker', false)
ON CONFLICT (user_id, os_slug) DO UPDATE SET enabled = EXCLUDED.enabled;
```

Flag resolution is server-side per request — see [docs/architecture/feature-flags.md](../architecture/feature-flags.md) and [ADR-007](../decisions/ADR-007-per-user-feature-flags.md).

### Inspecting the audit log

Every write through a per-OS BFF route appends to `agos_audit`. Tail it during local dev with:

```bash
psql $DATABASE_URL -c "SELECT created_at, os_slug, action FROM agos_audit ORDER BY created_at DESC LIMIT 20;"
```

Or use the UI at `/dashboard/audit` (cursor-paginated, filterable by os_slug). See [docs/architecture/audit-log.md](../architecture/audit-log.md) and [docs/security/audit-trail.md](../security/audit-trail.md) for the full schema and the `agos_audit` vs `audit_events` boundary.

## Running Tests

```bash
# All packages + apps
pnpm test

# Individual package
pnpm --filter platform-web test:run

# Python tests
cd apps/platform-api && pytest
```

## Type Checking

```bash
pnpm typecheck
```

## Linting

```bash
pnpm lint
```

## Troubleshooting

**`DATABASE_URL` connection refused**
- Make sure PostgreSQL is running: `pg_isready -h localhost -U platform`

**`argon2` native module errors**
- Requires `node-gyp` and build tools: `npm install -g node-gyp`
- macOS: `xcode-select --install`
- Linux: `apt-get install build-essential python3`

**`SESSION_SECRET` validation error**
- Must be at least 32 characters. Generate one: `openssl rand -base64 48`

**pnpm workspace packages not found**
- Run `pnpm install` from the repo root, not from an app subdirectory
