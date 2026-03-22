"""
Feature Gate Middleware for Tiresias.
Enforces tier-based feature access based on the active license.
Returns HTTP 402 when a request targets a feature not included in the current tier.
"""

import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

from src.license.validator import LicenseToken, LicenseStatus

logger = structlog.get_logger(__name__)

# Which tiers can access each feature
FEATURE_TIERS: dict[str, list[str]] = {
    # Starter (all tiers including community)
    "auth_identity": ["community", "starter", "pro", "enterprise"],
    "auth_evaluate": ["community", "starter", "pro", "enterprise"],
    "trial": ["community", "starter", "pro", "enterprise"],
    "health": ["community", "starter", "pro", "enterprise"],
    "admin_read": ["community", "starter", "pro", "enterprise"],
    # Pro features
    "analytics": ["pro", "enterprise"],
    "detection_rules": ["pro", "enterprise"],
    "delegation": ["pro", "enterprise"],
    "policy_git_sync": ["pro", "enterprise"],
    "admin_write": ["pro", "enterprise"],
    # Enterprise features
    "enforcement": ["enterprise"],
    "siem_forwarding": ["enterprise"],
    "audit_export": ["enterprise"],
    "multi_tenant": ["enterprise"],
    "custom_detection": ["enterprise"],
}

# Map URL path prefixes to features
ROUTE_FEATURES: dict[str, str] = {
    "/v1/analytics": "analytics",
    "/v1/detection": "detection_rules",
    "/v1/enforcement": "enforcement",
    "/v1/integrations": "siem_forwarding",
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
    for _t in ["community", "starter", "pro", "enterprise"]:
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


class FeatureGateMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces tier-based feature gating.
    Checks app.state.license to determine the current tier and blocks
    requests to features not included in that tier with HTTP 402.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path

        # Always allow exempt paths
        if _is_always_allowed(path):
            return await call_next(request)

        # Determine which feature this path requires
        feature = _get_feature_for_path(path)
        if feature is None:
            # Path not mapped to any feature - allow through
            return await call_next(request)

        # Get current license from app state
        license_token: LicenseToken | None = getattr(request.app.state, "license", None)

        if license_token is None or license_token.status == LicenseStatus.MISSING:
            current_tier = "community"
        else:
            current_tier = license_token.tier

        # Check if current tier includes the required feature
        if _tier_has_feature(current_tier, feature):
            return await call_next(request)

        # Feature not available - return 402
        required_tier = FEATURE_MIN_TIER.get(feature, "enterprise")

        logger.warning(
            "feature_gate.blocked",
            path=path,
            feature=feature,
            tier_current=current_tier,
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
                "upgrade_url": "https://tiresias.saluca.com/pricing",
            },
        )
