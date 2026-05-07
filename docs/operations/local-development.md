# Local Development (Non-Container)

This guide covers running the platform services directly on your machine without Docker.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22.x | `nvm install 22` |
| pnpm | 9.x | `corepack enable && corepack prepare pnpm@9.12.0 --activate` |
| Python | 3.11.x | `pyenv install 3.11.10` |
| uv | latest | `pip install uv` or `curl -Ls https://astral.sh/uv/install.sh | sh` |
| PostgreSQL | 16.x | `brew install postgresql@16` or Docker: `docker run -p 5432:5432 -e POSTGRES_PASSWORD=platform postgres:16-alpine` |
| Mailhog | optional | `brew install mailhog` or Docker (see below) |

Use `.tool-versions` with [asdf](https://asdf-vm.com/) to pin all versions automatically.

## Quick Start

```bash
# 1. Clone and enter repo
cd /path/to/tiresias

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

```bash
# Install packages/auth/python, packages/config/python, packages/observability/python
uv pip install -e packages/auth/python
uv pip install -e packages/config/python
uv pip install -e packages/observability/python

# Install platform-api
uv pip install -e apps/platform-api
```

### 4. Database setup

Start PostgreSQL (if not already running):
```bash
# Docker one-liner for local Postgres:
docker run -d --name tiresias-db \
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
npx tsx scripts/seed-admin.ts
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
