"""
Usage Limit Middleware — enforces tier request limits.
Implements USAGE-03.

Behavior:
  - 0-99% used:   pass through, no special header
  - 100-109%:     pass through + X-Usage-Warning header (soft block)
  - 110%+:        HTTP 429 with upgrade CTA in body (hard block)

Only checked on /v1/ paths (not /health, /healthz, /readyz, /docs).
Uses async DB session (not blocking).
"""

import uuid
import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

logger = structlog.get_logger(__name__)

# Paths that bypass usage enforcement
_BYPASS_PREFIXES = [
    "/health",
    "/healthz",
    "/readyz",
    "/docs",
    "/openapi",
    "/v1/usage",   # let usage endpoints through (avoid infinite loop)
    "/v1/auth/",   # identity checks always allowed
    "/v1/trial/",  # trial registration always allowed
]


def _is_bypassed(path: str) -> bool:
    return any(path.startswith(p) for p in _BYPASS_PREFIXES)


class UsageLimitMiddleware(BaseHTTPMiddleware):
    """
    Soft-block (warning header) at 100-109% of tier request limit.
    Hard-block (429) at 110%+.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path

        if _is_bypassed(path):
            return await call_next(request)

        # Extract tenant_id from header or cookie
        raw_id = request.headers.get("X-Tenant-ID") or request.cookies.get("tiresias_tenant")
        if not raw_id:
            # No identity — let auth middleware handle the 401
            return await call_next(request)

        try:
            tenant_id = uuid.UUID(raw_id)
        except ValueError:
            return await call_next(request)

        # Get tier from app state
        license_state = getattr(request.app.state, "license", None)
        tier = license_state.tier if license_state else "community"

        # Unlimited tiers skip enforcement entirely
        from src.usage.limits import TIER_LIMITS, pct_used
        limits = TIER_LIMITS.get(tier, TIER_LIMITS["community"])
        if limits["requests"] == -1:
            return await call_next(request)

        # Compute current request usage (lightweight — only request count matters for enforcement)
        try:
            from src.database.connection import async_session_factory
            from src.saas.metering import get_tenant_usage
            from datetime import datetime, timezone
            from src.usage.limits import _month_start

            period_start = _month_start()
            now = datetime.now(timezone.utc)
            async with async_session_factory() as db:
                raw = await get_tenant_usage(db, tenant_id, start=period_start, end=now)
            current_requests = raw.get("requests", 0)
        except Exception as e:
            logger.warning("usage_limit.check_failed", error=str(e), tenant_id=str(tenant_id))
            # On error, pass through — don't block on metering failure
            return await call_next(request)

        pct = pct_used(current_requests, limits["requests"])

        from src.usage.limits import BLOCK_PCT, HARD_PCT

        if pct >= HARD_PCT:
            # Hard block — 429
            logger.info(
                "usage_limit.hard_block",
                tenant_id=str(tenant_id),
                tier=tier,
                pct=pct,
                current=current_requests,
                limit=limits["requests"],
            )
            return JSONResponse(
                status_code=429,
                content={
                    "error": "usage_limit_exceeded",
                    "detail": (
                        f"You have exceeded 110% of your {tier} tier request limit "
                        f"({current_requests:,} / {limits['requests']:,} requests this month). "
                        "Please upgrade your plan to continue."
                    ),
                    "pct_used": pct,
                    "current": current_requests,
                    "limit": limits["requests"],
                    "tier": tier,
                    "upgrade_url": "/settings/billing",
                },
                headers={"Retry-After": "3600"},
            )

        # Call next and add warning header if in soft-block zone
        response = await call_next(request)

        if pct >= BLOCK_PCT:
            response.headers["X-Usage-Warning"] = (
                f"tier_limit_reached; pct={pct:.1f}; "
                f"current={current_requests}; limit={limits['requests']}; "
                f"upgrade_url=/settings/billing"
            )
            logger.info(
                "usage_limit.soft_warn",
                tenant_id=str(tenant_id),
                tier=tier,
                pct=pct,
            )

        return response
