# 15-Minute Quickstart

Goal: a developer with a fresh clone reaches the point where they can run
`pytest`, start the FastAPI app, and start the Next.js dev server — in
under 15 minutes.

> **Windows users: this guide assumes WSL2** (Ubuntu 22.04+). If you don't
> have WSL2, install it first via
> [Microsoft's WSL install guide](https://learn.microsoft.com/en-us/windows/wsl/install)
> and run everything below from a WSL shell. macOS and Linux users can
> follow the steps as-is.

## Prerequisites (one-time, ~5 min)

```bash
# Node 22 + pnpm 9
corepack enable
corepack prepare pnpm@9.12.0 --activate

# Python 3.11+ with uv (the canonical Python installer)
pip install uv

# Docker (for Postgres). Any 24+ install is fine.
docker --version
```

## Linear path: clone → run (10 min)

```bash
# 1. Clone + branch
git clone https://github.com/saluca-labs/pantheon.git
cd pantheon

# 2. Enable corepack (if not already)
corepack enable

# 3. Install Node deps
pnpm install --frozen-lockfile

# 4. Copy env
cp .env.example .env
# Edit .env if you need non-default DATABASE_URL / SESSION_SECRET; the
# defaults work with the docker-compose Postgres in step 5.

# 5. Start Postgres (background)
docker compose up -d db

# 6. Bootstrap (creates .venv, installs all Python packages, runs alembic)
pnpm bootstrap
# This invokes scripts/bootstrap.sh:
#   - pnpm install (re-resolves; no-op if step 3 finished)
#   - python -m venv .venv && uv pip install -e packages/* apps/platform-api
#   - python -m alembic upgrade head
#   - ./.venv/bin/python scripts/seed-admin.py (seeds an admin user)

# 7. Activate the Python venv (needed for pytest + uvicorn)
source .venv/bin/activate     # WSL/Linux/macOS
# .\.venv\Scripts\activate    # native PowerShell, if you ever go that route
```

## Verification — three terminals, three commands

### Terminal A: Next.js dashboard

```bash
cd apps/platform-web
pnpm dev
# → http://localhost:3000
```

### Terminal B: FastAPI core

```bash
source .venv/bin/activate
cd apps/platform-api
python -m uvicorn src.main:app --reload --port 8000
# → http://localhost:8000/docs
```

### Terminal C: a focused pytest

```bash
source .venv/bin/activate
# Pick any of these — all should pass on a fresh checkout
# (failures = real regressions, not flakes):
cd packages/secrets/python && pytest
cd ../../../apps/matrix-bridge/appservice && pytest
cd ../../packages/auth/python && pytest        # SoulAuth suite
```

You're up. The dashboard at <http://localhost:3000> talks to the FastAPI
core at <http://localhost:8000>; both share the Postgres container started
in step 5.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `pnpm: command not found` | `corepack enable` then `corepack prepare pnpm@9.12.0 --activate`. |
| `uv: command not found` | `pip install uv` (or `pipx install uv`). |
| `ImportError: platform_config` | You probably skipped step 7 — activate `.venv` first. |
| `alembic.util.exc.CommandError: Can't locate revision` | The DB has data from a different schema. Drop the `platform` DB and re-run `pnpm db:migrate`. |
| `psycopg2.OperationalError: connection refused` | Postgres isn't running — `docker compose up -d db`. |
| pnpm install hangs on Windows | You're not in WSL2 (or your repo lives on a NAS-backed path). Move it to local SSD inside WSL. |

## Next steps

- Full local-dev guide: [`docs/operations/local-development.md`](./local-development.md)
- Docker-only path: `pnpm docker:up` (see README "Container Setup").
- Architecture overview: see top of [README.md](../../README.md).
