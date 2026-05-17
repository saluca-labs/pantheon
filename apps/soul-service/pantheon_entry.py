"""
pantheon_entry.py — Pantheon wrapper around Soul's upstream serve.py.

This entrypoint sits OUTSIDE the vendored `soul/` package so it does not get
overwritten on the next `scripts/vendor-soul.sh` refresh. It imports the
upstream FastAPI app from `soul.serve` and bolts on Pantheon-specific
middleware:

  1. Shared-key auth via X-Soul-Service-Key header (env: SOUL_SERVICE_KEY).
     Fail-closed: in production (SOUL_ENV=production), the process refuses
     to start if SOUL_SERVICE_KEY is unset. Health endpoints are exempt so
     liveness/readiness probes work without the secret.

  2. A separate /health/live and /health/ready surface, matching the rest
     of the Pantheon namespace (memory-service, soulauth, etc. all expose
     /health/live + /health/ready). The upstream /health route is kept
     intact for backward compatibility with anyone running soul-svc
     standalone.

Usage:
  uvicorn pantheon_entry:app --host 0.0.0.0 --port 8080

Environment:
  SOUL_SERVICE_KEY    shared secret required on every non-health request
  SOUL_ENV            "production" | "development" (default development)
  SUPABASE_URL        Tier 2 (cold) Supabase project URL (optional;
                      service degrades to Tier 0/1 if absent)
  SUPABASE_SERVICE_KEY  Tier 2 service-role key (optional, paired with URL)
  SOUL_BUFFER_PATH    Tier 0 SQLite buffer path (default ~/.soul/active_kb.db)
  ANTHROPIC_API_KEY   required for compression layer (Level 1 + Level 2)
"""

from __future__ import annotations

import os
import sys
from typing import Awaitable, Callable

from fastapi import HTTPException, Request, Response
from fastapi.responses import JSONResponse

# Make the vendored `soul/` package importable. apps/soul-service/ is the
# package's parent, so adding the directory containing THIS file to sys.path
# exposes `soul` as a top-level import. This mirrors what upstream's
# Dockerfile does with `PYTHONPATH=/app` + `COPY . /app/soul/`.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from soul.serve import app  # noqa: E402  — must run after sys.path mutation

# ── Config ────────────────────────────────────────────────────────────────────

SOUL_SERVICE_KEY = os.getenv("SOUL_SERVICE_KEY", "")
SOUL_ENV = os.getenv("SOUL_ENV", "development").lower()

if SOUL_ENV == "production" and not SOUL_SERVICE_KEY:
    # Fail-closed boot: matches the memory-service pattern documented in
    # apps/memory-service/README.md#auth. The deployment manifest wires this
    # key in from the `pantheon-secrets` Secret (key: soul-service-key).
    print(
        "SOUL_SERVICE_KEY is required in production. Refusing to start.",
        file=sys.stderr,
    )
    sys.exit(1)


# ── Health surfaces matching the rest of the Pantheon namespace ───────────────

# The upstream /health is preserved by virtue of being defined in soul.serve.
# We add /health/live + /health/ready below so probes match the rest of the
# Pantheon namespace conventions (see memory-service-deployment.yaml).

@app.get("/health/live", include_in_schema=False)
def _health_live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready", include_in_schema=False)
def _health_ready() -> dict[str, str]:
    # Readiness is the same as liveness for now — Soul has no required
    # external dependency at boot (Tier 2 / Anthropic creds are checked
    # lazily on first use). If cold-tier connectivity becomes a hard
    # boot requirement, ping Supabase here.
    return {"status": "ready"}


# ── Auth middleware ──────────────────────────────────────────────────────────

_HEALTH_PATHS = {"/health", "/health/live", "/health/ready"}


@app.middleware("http")
async def _require_service_key(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """
    Reject any non-health request that lacks a valid X-Soul-Service-Key.

    In development (SOUL_ENV != "production") with no key configured, this
    middleware is a no-op so local docker-compose / pytest can call the
    endpoints freely.
    """
    if request.url.path in _HEALTH_PATHS:
        return await call_next(request)
    if not SOUL_SERVICE_KEY:
        # dev-mode bypass (see boot-time fail-closed for production)
        return await call_next(request)
    provided = request.headers.get("x-soul-service-key", "")
    if provided != SOUL_SERVICE_KEY:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return await call_next(request)
