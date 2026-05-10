#!/usr/bin/env bash
# ─── Pantheon DB Migrate ─────────────────────────────────────────────────────
# Runs both alembic trees against the configured DATABASE_URL, in the
# order required by the schema dependency graph:
#
#   1. apps/platform-api/alembic   — legacy SoulAuth schema; boot-critical.
#   2. packages/database/alembic   — newer local-auth / shared schema.
#
# Both trees use `script_location = alembic` and `prepend_sys_path = .`
# in their alembic.ini, so each must be invoked from its own directory
# (a top-level `-c apps/.../alembic.ini` would not resolve correctly).
#
# Schema consolidation into a single tree is a future XL refactor.
# Until then, this wrapper is the single source of truth invoked by
# `pnpm db:migrate` and by scripts/bootstrap.sh's migration step.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Pick a python: prefer the repo-root .venv, fall back to whatever's on PATH.
if [ -x "$REPO_ROOT/.venv/bin/python" ]; then
  PY="$REPO_ROOT/.venv/bin/python"
elif [ -x "$REPO_ROOT/.venv/Scripts/python.exe" ]; then
  PY="$REPO_ROOT/.venv/Scripts/python.exe"
else
  PY="$(command -v python3 || command -v python)"
fi

echo "[db:migrate] platform-api alembic (legacy SoulAuth schema)..."
(cd apps/platform-api && "$PY" -m alembic upgrade head)

echo "[db:migrate] packages/database alembic (local-auth schema)..."
(cd packages/database && "$PY" -m alembic upgrade head)

echo "[db:migrate] done."
