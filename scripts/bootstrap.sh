#!/usr/bin/env bash
# ─── Tiresias Platform Bootstrap ──────────────────────────────────────────────
# Sets up the local dev environment: installs deps, runs migrations, seeds admin.
#
# Usage: bash scripts/bootstrap.sh
#        Or via: pnpm bootstrap
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[bootstrap]${NC} $*"; }
warn()    { echo -e "${YELLOW}[bootstrap]${NC} $*"; }
error()   { echo -e "${RED}[bootstrap] ERROR:${NC} $*" >&2; exit 1; }

# ── Prerequisites ─────────────────────────────────────────────────────────────
command -v node >/dev/null   || error "node is required (>=22). Install via nvm."
command -v pnpm >/dev/null   || error "pnpm is required (v9). Run: corepack enable"
command -v python3 >/dev/null || warn  "python3 not found. Python packages will not be installed."
command -v uv >/dev/null     || warn  "uv not found. Python packages will not be installed. Install: pip install uv"

NODE_VERSION=$(node -v | tr -d 'v' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  error "Node.js 22+ is required. Current: $(node -v)"
fi

# ── .env ──────────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  warn ".env not found — copied from .env.example. Edit it before running services."
fi

# shellcheck source=/dev/null
source .env || true

# ── pnpm install ──────────────────────────────────────────────────────────────
info "Installing Node.js dependencies..."
pnpm install

# ── Python packages (optional) ────────────────────────────────────────────────
if command -v uv >/dev/null; then
  info "Installing Python auth package..."
  uv pip install -e packages/auth/python --quiet || warn "Python auth install failed (non-fatal in TS-only env)"
  info "Installing Python config package..."
  uv pip install -e packages/config/python --quiet || true
  info "Installing Python observability package..."
  uv pip install -e packages/observability/python --quiet || true
fi

# ── Database migrations ───────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  warn "DATABASE_URL is not set — skipping migrations. Set it in .env and re-run."
else
  info "Running database migrations (packages/database)..."
  cd packages/database && python -m alembic upgrade head && cd "$REPO_ROOT" || warn "Migrations failed — is the database running?"
fi

# ── Seed admin user ───────────────────────────────────────────────────────────
info "Seeding admin user..."
if command -v npx >/dev/null; then
  npx tsx scripts/seed-admin.ts 2>/dev/null || warn "seed-admin.ts failed (may already exist)"
else
  warn "npx/tsx not available — skipping admin seed"
fi

info "Bootstrap complete! Start the dev stack with: pnpm dev"
info "Or spin up containers with: pnpm docker:up"
