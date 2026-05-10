#!/usr/bin/env bash
# ─── Pantheon Bootstrap ──────────────────────────────────────────────────────
# Sets up the local dev environment: installs deps, runs migrations, seeds admin.
#
# Usage:
#   bash scripts/bootstrap.sh             # default: --full (TS + Python + DB)
#   bash scripts/bootstrap.sh --ts-only   # only Node/pnpm
#   bash scripts/bootstrap.sh --py-only   # only Python (uv) + DB migrations
#   bash scripts/bootstrap.sh --full      # explicit (same as default)
#
# Idempotent: re-running is safe; existing .venv, installed packages, and
# already-applied migrations are detected and skipped.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[bootstrap]${NC} $*"; }
warn()    { echo -e "${YELLOW}[bootstrap]${NC} $*"; }
error()   { echo -e "${RED}[bootstrap] ERROR:${NC} $*" >&2; exit 1; }

# ── Mode flags ────────────────────────────────────────────────────────────────
MODE="full"
for arg in "$@"; do
  case "$arg" in
    --ts-only) MODE="ts-only" ;;
    --py-only) MODE="py-only" ;;
    --full)    MODE="full" ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) error "Unknown argument: $arg (use --ts-only|--py-only|--full)" ;;
  esac
done

want_ts() { [ "$MODE" = "ts-only" ] || [ "$MODE" = "full" ]; }
want_py() { [ "$MODE" = "py-only" ] || [ "$MODE" = "full" ]; }

info "Mode: $MODE"

# ── Prerequisites ─────────────────────────────────────────────────────────────
if want_ts; then
  command -v node >/dev/null   || error "node is required (>=22). Install via nvm."
  command -v pnpm >/dev/null   || error "pnpm is required (v9). Run: corepack enable"
  NODE_VERSION=$(node -v | tr -d 'v' | cut -d. -f1)
  if [ "$NODE_VERSION" -lt 22 ]; then
    error "Node.js 22+ is required. Current: $(node -v)"
  fi
fi

if want_py; then
  command -v python3 >/dev/null || command -v python >/dev/null \
    || error "python3 is required (>=3.11) for Python packages."
  command -v uv >/dev/null \
    || error "uv is required for Python packages. Install: pip install uv"
fi

# ── .env ──────────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  warn ".env not found — copied from .env.example. Edit it before running services."
fi

# shellcheck source=/dev/null
# Sourcing .env can trip `set -u` (nounset) on values that legitimately
# contain unset shell expansions like '$' literals. Drop nounset for the
# source itself; do NOT swallow real syntax errors with `|| true`.
set +u
set -a; source .env; set +a
set -u

# ── pnpm install ──────────────────────────────────────────────────────────────
if want_ts; then
  info "Installing Node.js dependencies (pnpm install --frozen-lockfile)..."
  # --frozen-lockfile matches CI semantics: never silently relax
  # constraints, fail if pnpm-lock.yaml is out of date with package.json.
  pnpm install --frozen-lockfile
fi

# ── Repo-root .venv + Python packages ─────────────────────────────────────────
if want_py; then
  PYBIN=$(command -v python3 || command -v python)
  if [ ! -d "$REPO_ROOT/.venv" ]; then
    info "Creating repo-root virtualenv at .venv (using $PYBIN)..."
    "$PYBIN" -m venv "$REPO_ROOT/.venv"
  else
    info ".venv already present — reusing."
  fi

  # Activate cross-platform: POSIX vs Windows (Git Bash / WSL)
  if [ -f "$REPO_ROOT/.venv/bin/activate" ]; then
    # shellcheck source=/dev/null
    source "$REPO_ROOT/.venv/bin/activate"
  elif [ -f "$REPO_ROOT/.venv/Scripts/activate" ]; then
    # shellcheck source=/dev/null
    source "$REPO_ROOT/.venv/Scripts/activate"
  else
    error "Could not find .venv activate script"
  fi

  info "Installing shared Python packages (editable)..."
  uv pip install -e packages/secrets/python --quiet
  uv pip install -e packages/config/python --quiet
  uv pip install -e packages/observability/python --quiet
  uv pip install -e packages/auth/python --quiet
  uv pip install -e packages/memory-client/python --quiet

  if [ -d apps/platform-api ]; then
    info "Installing apps/platform-api (editable + requirements.txt)..."
    uv pip install -e apps/platform-api --quiet
    if [ -f apps/platform-api/requirements.txt ]; then
      uv pip install -r apps/platform-api/requirements.txt --quiet
    fi
  fi

  if [ -d packages/database ]; then
    info "Installing packages/database (editable, for alembic CLI)..."
    uv pip install -e packages/database --quiet
  fi
fi

# ── Database migrations ───────────────────────────────────────────────────────
# Pantheon currently maintains TWO alembic trees:
#   1. apps/platform-api/alembic   — legacy SoulAuth schema; boot-critical
#                                     (the FastAPI core won't start cleanly
#                                     without these tables).
#   2. packages/database/alembic   — newer local-auth / shared schema.
# Both must run on a fresh DB. Schema consolidation into a single tree is
# a future XL refactor (separate ticket; out of MVP scope). Until then we
# run them in dependency order: platform-api FIRST, packages/database
# SECOND. Both are hard-fail (`error`, not `warn`) — silent migration
# failures are the worst kind of latent bug.
if want_py; then
  if [ -z "${DATABASE_URL:-}" ]; then
    warn "DATABASE_URL is not set — skipping migrations. Set it in .env and re-run."
  else
    info "Running platform-api alembic (legacy SoulAuth schema)..."
    (cd apps/platform-api && python -m alembic upgrade head) \
      || error "platform-api migrations failed — is the database running? (docker compose up -d db)"

    info "Running packages/database alembic (local-auth schema)..."
    (cd packages/database && python -m alembic upgrade head) \
      || error "packages/database migrations failed"
  fi
fi

# ── Seed admin user (Python, canonical) ───────────────────────────────────────
# Python is the single canonical seeder. Reason: argon2 password hashing
# must match the Python auth system; one implementation = no drift.
# The TypeScript seeder was deleted in the same change set.
if want_py && [ -n "${DATABASE_URL:-}" ]; then
  info "Seeding admin user (scripts/seed-admin.py)..."
  ./.venv/bin/python scripts/seed-admin.py \
    || error "seed-admin failed"
fi

info "Bootstrap complete!"
case "$MODE" in
  full)    info "Start the dev stack with: pnpm dev (or: pnpm docker:up)" ;;
  ts-only) info "Start the Next.js stack with: pnpm dev" ;;
  py-only) info "Activate venv: source .venv/bin/activate (or .venv/Scripts/activate on Windows)" ;;
esac
