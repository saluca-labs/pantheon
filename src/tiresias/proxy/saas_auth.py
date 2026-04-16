"""
SaaS Auth Middleware for Tiresias Proxy.

In SaaS mode (TIRESIAS_MODE=saas), resolves tenant_id from the Tiresias API key
on every request. The API key is passed via:
  - Authorization: Bearer tir_<slug>_<hex32>
  - X-Tiresias-Api-Key: tir_<slug>_<hex32>

The key is SHA-256 hashed and looked up against tiresias_licenses.api_key_hash.
On match, request.state.tenant_id and request.state.tenant_tier are set.

In dedicated/onprem modes, this middleware is a no-op.

Feature flag: SAAS_AUTH_REQUIRE_TENANT_REGISTRATION (default False).
When True, every resolved tenant_id must also exist in _soul_tenants with
status='active'. Tenants missing from that table or with non-active status
receive an opaque 403. Verbose diagnostic is written to the backend log only.
"""

from __future__ import annotations

import hashlib
import logging
import time
from typing import TYPE_CHECKING

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from tiresias.storage.schema import TiresiasLicense

if TYPE_CHECKING:
    from tiresias.config import TiresiasSettings

logger = logging.getLogger(__name__)

# Paths that bypass tenant auth (health, docs, OpenAPI)
_AUTH_EXEMPT_PATHS = frozenset({
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
})

# In-memory cache: api_key_hash -> (tenant_id, tier, tenant_valid, quarantined, soulkey_id, cached_at)
# tenant_valid: True  = soul_tenants check passed (or flag was OFF at cache time)
#               False = soul_tenants check failed (cached 403 result)
#               None  = flag was OFF when cached; re-validate on hit when flag turns ON
# quarantined:  True  = active row found in _soulwatch_quarantines (return 403)
#               False = not quarantined (or SOULWATCH_QUARANTINE_INPROXY_CHECK env not set)
# soulkey_id:   str UUID of the active soulkey bound to this license, or None.
#               Injected into request.state.soulkey_id for downstream audit attribution
#               (tiresias_audit_log.soulkey_id column; Tier 1 Item 6, v0.6.20).
#
# INTERIM: in-proxy quarantine check (Option ii, Tier 2a, 2026-04-15).
# When Tier 2b (soulgate wiring) ships, the quarantined field and
# _check_soulwatch_quarantine query can be removed; enforcement delegates to soulgate.
_tenant_cache: dict[str, tuple[str, str, bool | None, bool, str | None, float]] = {}
_CACHE_TTL_SECONDS = 60

# Sentinel: cleared once after the flag transitions from False to True at runtime.
# Ensures first request after a flag-flip evicts stale OFF-era cache entries.
_cleared_since_flag_on: bool = False


def _hash_api_key(raw_key: str) -> str:
    """SHA-256 hash of the raw API key, matching the stored api_key_hash."""
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def _extract_api_key(request: Request) -> str | None:
    """Extract Tiresias API key from Authorization header or X-Tiresias-Api-Key."""
    # Check custom header first (preferred for passthrough scenarios)
    key = request.headers.get("x-tiresias-api-key")
    if key:
        return key.strip()

    # Fall back to Authorization: Bearer
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer ") and auth[7:].strip().startswith("tir_"):
        return auth[7:].strip()

    return None


def clear_tenant_cache() -> None:
    """Clear the in-memory tenant cache (useful for testing and key rotation)."""
    _tenant_cache.clear()


async def _check_soulwatch_quarantine(session: AsyncSession, key_hash: str) -> bool:
    """Return True if the soulkey associated with this API key hash is actively quarantined.

    Joins tiresias_licenses (by api_key_hash) -> _soulkeys (by soulkey_id) ->
    _soulwatch_quarantines (status='active').

    INTERIM check (Option ii): removed when Tier 2b soulgate wiring ships.
    Gated by SOULWATCH_QUARANTINE_INPROXY_CHECK env var (must be 'true' to activate).
    """
    import os as _os
    if _os.environ.get("SOULWATCH_QUARANTINE_INPROXY_CHECK", "").lower() != "true":
        return False

    try:
        result = await session.execute(
            text(
                "SELECT 1 FROM _soulwatch_quarantines q "
                "WHERE q.soulkey_id = ("
                "  SELECT sk.id FROM _soulkeys sk "
                "  JOIN tiresias_licenses tl ON tl.tenant_id = sk.tenant_id "
                "  WHERE tl.api_key_hash = :key_hash LIMIT 1"
                ") AND q.status = 'active' LIMIT 1"
            ),
            {"key_hash": key_hash},
        )
        return result.first() is not None
    except Exception:
        # If the quarantine table is unreachable, fail open (don't block traffic).
        logger.warning("saas_auth.quarantine_check_failed", key_hash_prefix=key_hash[:12])
        return False


async def _resolve_soulkey_id(session: AsyncSession, tenant_id: str) -> str | None:
    """Return the UUID of an active soulkey for this tenant, or None.

    Used for audit attribution (tiresias_audit_log.soulkey_id). We pick the
    earliest-issued active soulkey to produce a stable attribution when a
    tenant has multiple active keys; this matches the heuristic called out in
    Tier 1 Item 4's backfill SQL.
    """
    try:
        result = await session.execute(
            text(
                "SELECT id::text FROM _soulkeys "
                "WHERE tenant_id = :tid AND status = 'active' "
                "ORDER BY issued_at ASC NULLS LAST, id ASC LIMIT 1"
            ),
            {"tid": tenant_id},
        )
        row = result.first()
        return row[0] if row else None
    except Exception:
        logger.warning("saas_auth.soulkey_resolve_failed tenant_id=%s", tenant_id)
        return None


async def _check_soul_tenant(session: AsyncSession, tenant_id: str) -> bool:
    """Check that tenant_id exists in _soul_tenants with status='active'.

    Returns True if valid, False otherwise.
    This is a raw SQL query because _soul_tenants is managed by soul-svc,
    not by Tiresias ORM models.
    """
    result = await session.execute(
        text(
            "SELECT status FROM _soul_tenants WHERE id = :tid LIMIT 1"
        ),
        {"tid": tenant_id},
    )
    row = result.first()
    return row is not None and row[0] == "active"


class SaaSAuthMiddleware(BaseHTTPMiddleware):
    """Resolves tenant from Tiresias API key in SaaS mode.

    Injects request.state.tenant_id and request.state.tenant_tier.
    Returns 401 if no valid key is found.
    Returns 403 (opaque) if flag is ON and tenant is not in _soul_tenants/active.

    NOTE on exempt paths: requests whose path is in _AUTH_EXEMPT_PATHS
    (e.g. /health, /docs) are forwarded immediately without any API-key
    check or soulauth/PDP call.  This prevents health-probe noise from
    appearing in the soulauth audit log and triggering false-positive
    privilege-escalation detections in soulwatch (ref B7-FIX-HEALTH-PROBE-NOISE).
    """

    def __init__(self, app, settings: "TiresiasSettings", engine_factory):
        super().__init__(app)
        self.settings = settings
        self.engine_factory = engine_factory

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        global _cleared_since_flag_on

        # Skip in non-SaaS modes
        if self.settings.mode != "saas":
            request.state.tenant_id = self.settings.tenant_id
            return await call_next(request)

        # Skip exempt paths — MUST happen before any auth/audit work so that
        # k8s liveness/readiness probes and health-check endpoints never
        # generate auth_deny audit events in soulauth.
        if request.url.path in _AUTH_EXEMPT_PATHS:
            return await call_next(request)

        flag_on = self.settings.saas_auth_require_tenant_registration

        # Auto-clear cache on first request after flag transitions ON.
        # Evicts OFF-era entries that have tenant_valid=None, which might
        # let unregistered tenants through if not evicted.
        if flag_on and not _cleared_since_flag_on:
            clear_tenant_cache()
            _cleared_since_flag_on = True
            logger.info(
                "SAAS_AUTH_REQUIRE_TENANT_REGISTRATION flipped ON — "
                "tenant cache cleared to force re-validation"
            )

        # Extract API key
        raw_key = _extract_api_key(request)
        if not raw_key:
            # Missing key on a non-exempt path: return 401.
            # Do NOT emit any soulauth audit event here — the 401 is handled
            # entirely within the proxy and does not reach soulauth's PDP.
            return JSONResponse(
                status_code=401,
                content={
                    "error": "missing_api_key",
                    "detail": "Tiresias API key required. Pass via Authorization: Bearer tir_... or X-Tiresias-Api-Key header.",
                },
            )

        key_hash = _hash_api_key(raw_key)
        key_hash_prefix = key_hash[:12]

        # Check cache first
        now = time.monotonic()
        cached = _tenant_cache.get(key_hash)
        if cached and (now - cached[5]) < _CACHE_TTL_SECONDS:
            tenant_id, tier, tenant_valid, quarantined, cached_soulkey_id, _ = cached

            # If flag is ON, re-validate entries cached while flag was OFF
            # (tenant_valid is None) rather than letting them through.
            if flag_on and tenant_valid is None:
                # Fall through to DB path to get fresh soul_tenants check.
                pass
            else:
                if flag_on and tenant_valid is False:
                    # Cached 403 — re-use without a DB round-trip.
                    logger.warning(
                        "auth_gate_deny tenant_id=%s api_key_hash_prefix=%s "
                        "reason=tenant_not_in_soul_tenants_or_inactive "
                        "source=cache severity=SECURITY",
                        tenant_id,
                        key_hash_prefix,
                    )
                    return JSONResponse(
                        status_code=403,
                        content={"error": "authentication_failed"},
                    )
                # Quarantine check (interim Option ii)
                if quarantined:
                    logger.warning(
                        "auth_gate_deny tenant_id=%s api_key_hash_prefix=%s "
                        "reason=agent_quarantined source=cache severity=SECURITY",
                        tenant_id,
                        key_hash_prefix,
                    )
                    return JSONResponse(
                        status_code=403,
                        content={"error": "agent_quarantined"},
                    )
                request.state.tenant_id = tenant_id
                request.state.tenant_tier = tier
                request.state.soulkey_id = cached_soulkey_id
                return await call_next(request)

        # Cache miss (or re-validation needed) — look up in DB
        try:
            engine = await self.engine_factory()
            async with AsyncSession(engine) as session:
                result = await session.execute(
                    select(TiresiasLicense.tenant_id, TiresiasLicense.tier).where(
                        TiresiasLicense.api_key_hash == key_hash
                    )
                )
                row = result.first()

                if not row:
                    return JSONResponse(
                        status_code=401,
                        content={"error": "invalid_api_key", "detail": "Invalid Tiresias API key."},
                    )

                tenant_id, tier = row[0], row[1]

                # Quarantine check (interim Option ii, Tier 2a, 2026-04-15)
                is_quarantined = await _check_soulwatch_quarantine(session, key_hash)
                if is_quarantined:
                    logger.warning(
                        "auth_gate_deny tenant_id=%s api_key_hash_prefix=%s "
                        "reason=agent_quarantined source=db severity=SECURITY",
                        tenant_id,
                        key_hash_prefix,
                    )
                    _tenant_cache[key_hash] = (tenant_id, tier, True, True, None, now)
                    return JSONResponse(
                        status_code=403,
                        content={"error": "agent_quarantined"},
                    )

                # Resolve an active soulkey for this tenant (Tier 1 Item 6,
                # v0.6.20).  Used purely for audit attribution; auth decision
                # is already made by the license hash match.  None-safe.
                resolved_soulkey_id = await _resolve_soulkey_id(session, tenant_id)

                # If flag is ON, cross-check against _soul_tenants
                if flag_on:
                    soul_valid = await _check_soul_tenant(session, tenant_id)
                    if not soul_valid:
                        logger.warning(
                            "auth_gate_deny tenant_id=%s api_key_hash_prefix=%s "
                            "reason=tenant_not_in_soul_tenants_or_inactive "
                            "source=db severity=SECURITY",
                            tenant_id,
                            key_hash_prefix,
                        )
                        # Cache the negative result so we don't re-query on every request
                        _tenant_cache[key_hash] = (tenant_id, tier, False, False, resolved_soulkey_id, now)
                        return JSONResponse(
                            status_code=403,
                            content={"error": "authentication_failed"},
                        )
                    # Tenant passed all checks — cache as valid, not quarantined
                    _tenant_cache[key_hash] = (tenant_id, tier, True, False, resolved_soulkey_id, now)
                else:
                    # Flag OFF — cache with tenant_valid=None so it's re-checked
                    # if flag flips ON before TTL expires.
                    _tenant_cache[key_hash] = (tenant_id, tier, None, False, resolved_soulkey_id, now)

        except Exception:
            logger.exception("SaaS auth DB lookup failed")
            return JSONResponse(
                status_code=503,
                content={"error": "auth_unavailable", "detail": "Authentication service temporarily unavailable."},
            )

        # Inject into request state
        request.state.tenant_id = tenant_id
        request.state.tenant_tier = tier
        request.state.soulkey_id = resolved_soulkey_id

        return await call_next(request)
