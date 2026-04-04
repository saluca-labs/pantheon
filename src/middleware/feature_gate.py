"""
Feature Gate Middleware for Tiresias.
Enforces tier-based feature access based on per-tenant subscription tier
AND the install-level license. Effective tier = min(install, tenant).
Returns HTTP 402 when a request targets a feature not included in the effective tier.
"""

import structlog
from fastapi import Request
from sqlalchemy import select, text
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

from src.license.validator import LicenseToken, LicenseStatus
from src.tier import Tier, TIER_ORDER, VALID_TIERS as ALL_TIERS, DEFAULT_TIER, effective_tier

logger = structlog.get_logger(__name__)

# Which tiers can access each feature
FEATURE_TIERS: dict[str, list[str]] = {
    # Starter (all tiers including community)
    "auth_identity": ["community", "starter", "pro", "enterprise", "mssp", "saas"],
    "auth_evaluate": ["community", "starter", "pro", "enterprise", "mssp", "saas"],
    "trial": ["community", "starter", "pro", "enterprise", "mssp", "saas"],
    "health": ["community", "starter", "pro", "enterprise", "mssp", "saas"],
    "admin_read": ["community", "starter", "pro", "enterprise", "mssp", "saas"],
    # Pro features
    "analytics": ["pro", "enterprise", "mssp", "saas"],
    "detection_rules": ["pro", "enterprise", "mssp", "saas"],
    "delegation": ["pro", "enterprise", "mssp", "saas"],
    "policy_git_sync": ["pro", "enterprise", "mssp", "saas"],
    "admin_write": ["pro", "enterprise", "mssp", "saas"],
    # Enterprise features
    "enforcement": ["enterprise", "mssp", "saas"],
    "siem_forwarding": ["enterprise", "mssp", "saas"],
    "audit_export": ["enterprise", "mssp", "saas"],
    "multi_tenant": ["enterprise", "mssp", "saas"],
    "custom_detection": ["enterprise", "mssp", "saas"],
}

# Map URL path prefixes to features
ROUTE_FEATURES: dict[str, str] = {
    "/v1/analytics": "analytics",
    "/v1/detection": "detection_rules",
    "/v1/enforcement": "enforcement",
    "/v1/integrations": "siem_forwarding",
    # Audit export lives under the admin router (/v1/soulauth/admin/audit/report)
    # but audit_export is enterprise-gated, so we map it explicitly here.
    "/v1/soulauth/admin/audit": "audit_export",
    # MSSP multi-tenant endpoints
    "/v1/mssp": "multi_tenant",
}

# Paths that are always allowed regardless of license
ALWAYS_ALLOWED_PREFIXES = [
    "/v1/auth/",
    "/v1/trial/",
    "/v1/waitlist/",
    "/v1/soulauth/admin/",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/metrics",
    "/",
]

# Minimum required tier for each feature (for the 402 response)
FEATURE_MIN_TIER: dict[str, str] = {}
for _feature, _tiers in FEATURE_TIERS.items():
    # The minimum tier is the first in the ordered tier list that appears
    for _t in ["community", "starter", "pro", "enterprise", "mssp", "saas"]:
        if _t in _tiers:
            FEATURE_MIN_TIER[_feature] = _t
            break


def _get_feature_for_path(path: str) -> str | None:
    """Determine which feature a request path requires, if any."""
    for prefix, feature in ROUTE_FEATURES.items():
        if path.startswith(prefix):
            return feature
    return None


def _is_always_allowed(path: str) -> bool:
    """Check if a path is exempt from feature gating."""
    # Root path exact match
    if path == "/":
        return True
    for prefix in ALWAYS_ALLOWED_PREFIXES:
        if prefix != "/" and path.startswith(prefix):
            return True
    return False


def _tier_has_feature(tier: str, feature: str) -> bool:
    """Check if a tier includes a given feature."""
    allowed_tiers = FEATURE_TIERS.get(feature, [])
    return tier in allowed_tiers


async def _resolve_tenant_tier(tenant_id) -> str:
    """Lightweight DB lookup for tenant tier. Returns DEFAULT_TIER on failure."""
    try:
        from src.database.connection import async_session_factory
        async with async_session_factory() as db:
            result = await db.execute(
                text("SELECT tier FROM _soul_tenants WHERE id = :tid"),
                {"tid": str(tenant_id)},
            )
            row = result.first()
            return row[0] if row and row[0] in ALL_TIERS else DEFAULT_TIER
    except Exception as e:
        logger.warning("feature_gate.tenant_tier_lookup_failed", error=str(e))
        return DEFAULT_TIER


class FeatureGateMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces tier-based feature gating.
    Computes effective tier = min(install_license_tier, tenant_subscription_tier).
    Install license caps the ceiling; tenant tier reflects what they paid for.
    Returns HTTP 402 when a feature is not included in the effective tier.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path

        # Determine which feature this path requires.
        # Check this BEFORE always-allowed so that explicitly gated sub-paths
        # (e.g. /v1/soulauth/admin/audit under the /v1/soulauth/admin/ exemption)
        # are still enforced.
        feature = _get_feature_for_path(path)

        if feature is None:
            # No explicit feature gate — fall through to always-allowed / pass-through
            if _is_always_allowed(path):
                return await call_next(request)
            # Path not mapped to any feature and not exempt - allow through
            return await call_next(request)

        # --- Install-level tier (license JWT) ---
        license_token: LicenseToken | None = getattr(request.app.state, "license", None)
        if license_token is None or license_token.status == LicenseStatus.MISSING:
            install_tier = DEFAULT_TIER
        else:
            install_tier = license_token.tier

        # --- Per-tenant tier (subscription from DB) ---
        tenant_ctx = getattr(request.state, "tenant_context", None)
        if tenant_ctx and hasattr(tenant_ctx, "tenant_id") and tenant_ctx.tenant_id:
            tenant_tier = await _resolve_tenant_tier(tenant_ctx.tenant_id)
        else:
            tenant_tier = install_tier  # No tenant context → use install tier only

        # Effective tier = min(install, tenant) — install caps the ceiling
        current_tier = effective_tier(install_tier, tenant_tier)

        # Check if effective tier includes the required feature
        if _tier_has_feature(current_tier, feature):
            return await call_next(request)

        # Feature not available - return 402
        required_tier = FEATURE_MIN_TIER.get(feature, "enterprise")

        logger.warning(
            "feature_gate.blocked",
            path=path,
            feature=feature,
            tier_effective=current_tier,
            tier_install=install_tier,
            tier_tenant=tenant_tier,
            tier_required=required_tier,
        )

        return JSONResponse(
            status_code=402,
            content={
                "error": "feature_not_licensed",
                "detail": f"Feature '{feature}' requires the {required_tier} tier or higher.",
                "feature": feature,
                "tier_required": required_tier,
                "tier_current": current_tier,
                "upgrade_url": "https://tiresias.network/pricing",
            },
        )
