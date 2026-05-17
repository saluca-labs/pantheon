"""
pantheon_entry.py — Pantheon wrapper around Soul's upstream serve.py.

This entrypoint sits OUTSIDE the vendored `soul/` package so it does not get
overwritten on the next `scripts/vendor-soul.sh` refresh. It imports the
upstream FastAPI app from `soul.serve` and bolts on Pantheon-specific
middleware:

  1. Shared-key auth via X-Soul-Service-Key header (env: SOUL_SERVICE_KEY).
     Opt-in: when SOUL_SERVICE_KEY is set, every non-health request must
     present a matching X-Soul-Service-Key header or it is rejected with
     401. When SOUL_SERVICE_KEY is unset or empty, the service boots
     fail-open and logs a single WARNING at startup; all requests are
     accepted without authentication. Health endpoints are always exempt
     so liveness/readiness probes work without the secret.

  2. A separate /health/live and /health/ready surface, matching the rest
     of the Pantheon namespace (memory-service, soulauth, etc. all expose
     /health/live + /health/ready). The upstream /health route is kept
     intact for backward compatibility with anyone running soul-svc
     standalone.

Usage:
  uvicorn pantheon_entry:app --host 0.0.0.0 --port 8080

Environment:
  SOUL_SERVICE_KEY    shared secret; when set, required on every non-health
                      request. When unset/empty the service boots fail-open
                      and logs a startup WARNING.
  SOUL_ENV            "production" | "development" (default development);
                      informational only, does not gate auth posture.
  SUPABASE_URL        Tier 2 (cold) Supabase project URL (optional;
                      service degrades to Tier 0/1 if absent)
  SUPABASE_SERVICE_KEY  Tier 2 service-role key (optional, paired with URL)
  SOUL_BUFFER_PATH    Tier 0 SQLite buffer path (default ~/.soul/active_kb.db)
  ANTHROPIC_API_KEY   required for compression layer (Level 1 + Level 2)
"""

from __future__ import annotations

import logging
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

_logger = logging.getLogger("pantheon.soul_service")

if not SOUL_SERVICE_KEY:
    # Fail-open boot for the MVP rollout: the pod must be deploy-able before
    # the Secret Manager key is wired in. When SOUL_SERVICE_KEY *is* set, the
    # middleware below still enforces it strictly. The deployment manifest
    # will wire the key from the `pantheon-secrets` Secret (key:
    # soul-service-key) once it exists.
    _logger.warning(
        "SOUL_SERVICE_KEY not set - soul-service is running fail-open; "
        "all requests will be accepted without authentication"
    )


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

    When SOUL_SERVICE_KEY is unset (any environment), this middleware is a
    no-op so local docker-compose / pytest / pre-secret-rollout deploys can
    call the endpoints freely. The boot-time WARNING above announces that
    fail-open posture once at startup.
    """
    if request.url.path in _HEALTH_PATHS:
        return await call_next(request)
    if not SOUL_SERVICE_KEY:
        # fail-open bypass (see boot-time WARNING)
        return await call_next(request)
    provided = request.headers.get("x-soul-service-key", "")
    if provided != SOUL_SERVICE_KEY:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return await call_next(request)
