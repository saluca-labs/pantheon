"""
pantheon_entry.py — Pantheon wrapper around Soul's upstream serve.py.

This entrypoint sits OUTSIDE the vendored `soul/` package so it does not get
overwritten on the next `scripts/vendor-soul.sh` refresh. It imports the
upstream FastAPI app from `soul.serve` and bolts on Pantheon-specific
middleware:

  1. Shared-key auth via X-Soul-Service-Key header (env: SOUL_SERVICE_KEY),
     with a fail-closed-in-production posture:

       - SOUL_SERVICE_KEY set            -> ENFORCE. Every non-health request
                                            must present a matching
                                            X-Soul-Service-Key header or it is
                                            rejected with 401.
       - no key + SOUL_ENV=production    -> REFUSE TO START. soul-service holds
                                            the agent's memory; it must not run
                                            unauthenticated in production. The
                                            entrypoint raises at import so
                                            uvicorn never serves.
       - no key + SOUL_ENV=development   -> FAIL-OPEN (dev convenience). Boots
                                            and logs a single startup WARNING;
                                            all requests are accepted without
                                            authentication.

     Health endpoints are always exempt so liveness/readiness probes work
     without the secret. This matches the sibling `memory-service`, which
     already refuses to start in production without `MEMORY_SERVICE_KEY` and
     only fails open in dev (see apps/memory-service/README.md#auth).

  2. A separate /health/live and /health/ready surface, matching the rest
     of the Pantheon namespace (memory-service, soulauth, etc. all expose
     /health/live + /health/ready). The upstream /health route is kept
     intact for backward compatibility with anyone running soul-svc
     standalone.

Usage:
  uvicorn pantheon_entry:app --host 0.0.0.0 --port 8080

Environment:
  SOUL_SERVICE_KEY    shared secret; when set, required on every non-health
                      request. When unset/empty the auth posture is decided
                      by SOUL_ENV (see below).
  SOUL_ENV            "production" | "development" (default development).
                      Gates the no-key auth posture: production refuses to
                      start without a key; development fails open with a
                      startup WARNING.
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


class InsecureSoulConfigError(RuntimeError):
    """Raised when soul-service would run unauthenticated in production."""


def resolve_auth_posture(service_key: str, env: str) -> str:
    """Decide the service's auth posture from config. Pure + unit-testable.

    Returns:
        "enforce"   — a key is set; every non-health request must match it.
        "fail-open" — no key, non-production; requests pass unauthenticated
                      (dev convenience). The caller logs a startup WARNING.

    Raises:
        InsecureSoulConfigError — no key while SOUL_ENV=production. soul-service
            holds the agent's memory and must never run unauthenticated in
            production, so the entrypoint refuses to start. This mirrors
            memory-service, which exits on a missing key in production.
    """
    if service_key:
        return "enforce"
    if env == "production":
        raise InsecureSoulConfigError(
            "SOUL_SERVICE_KEY is required when SOUL_ENV=production. "
            "Refusing to start: soul-service holds agent memory and must not "
            "run unauthenticated in production. Set SOUL_SERVICE_KEY (wired "
            "from pantheon-secrets/soul-service-key) or set SOUL_ENV=development "
            "for local, unauthenticated use."
        )
    return "fail-open"


AUTH_POSTURE = resolve_auth_posture(SOUL_SERVICE_KEY, SOUL_ENV)

if AUTH_POSTURE == "fail-open":
    _logger.warning(
        "SOUL_SERVICE_KEY not set and SOUL_ENV=%s — soul-service is running "
        "fail-open; all requests are accepted without authentication. This is "
        "permitted for local development only; production refuses to start "
        "without a key.",
        SOUL_ENV or "development",
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

    Posture is resolved once at boot (see resolve_auth_posture):

      - "enforce"   : a key is set; the header must match or the request is
                      rejected with 401.
      - "fail-open" : no key, development only; requests pass unauthenticated.
                      A no-key production deploy never reaches this middleware
                      because the entrypoint refuses to start.

    Health endpoints are always exempt so probes work without the secret.
    """
    if request.url.path in _HEALTH_PATHS:
        return await call_next(request)
    if AUTH_POSTURE == "fail-open":
        return await call_next(request)
    provided = request.headers.get("x-soul-service-key", "")
    if provided != SOUL_SERVICE_KEY:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return await call_next(request)
