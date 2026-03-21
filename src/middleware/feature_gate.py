"""
Feature Gate Middleware for Tiresias.
Enforces tier-based feature access based on the active license.
Returns HTTP 402 when a request targets a feature not included in the current tier.
Returns HTTP 403 when a request targets a tier-restricted route (mssp/saas guards).
"""

import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

from src.license.validator import LicenseToken, LicenseStatus

logger = structlog.get_logger(__name__)

# Ordered tier hierarchy: community < starter < pro < enterprise < mssp < saas
# Each tier inherits all features of lower tiers.
TIER_ORDER: list[str] = ["community", "starter", "pro", "enterprise", "mssp", "saas"]


def _tier_rank(tier: str) -> int:
    """Return numeric rank of a tier; unknown tiers get rank -1."""
    try:
        return TIER_ORDER.index(tier)
    except ValueError:
        return -1


# Which tiers can access each feature (minimum tier and all above it)
# Use _tier_rank to check access — a tier passes if its rank >= feature minimum rank.
FEATURE_MIN_TIER: dict[str, str] = {
    # community and above
    "auth_identity": "community",
    "auth_evaluate": "community",
    "trial": "community",
    "health": "community",
    "admin_read": "community",
    # pro and above
    "analytics": "pro",
    "detection_rules": "pro",
    "delegation": "pro",
    "policy_git_sync": "pro",
    "admin_write": "pro",
    # enterprise and above
    "enforcement": "enterprise",
    "siem_forwarding": "enterprise",
    "audit_export": "enterprise",
    "multi_tenant": "enterprise",
    "custom_detection": "enterprise",
    # mssp and above (mssp + saas)
    "tenant_hierarchy": "mssp",
    "cross_tenant_query": "mssp",
    "tenant_provisioning": "mssp",
    # saas only
    "managed_provisioning": "saas",
    "billing_integration": "saas",
    "white_label": "mssp",
    # aletheia (enterprise and above)
    "aletheia_cot_intercept": "enterprise",
    "aletheia_cot_content_storage": "enterprise",
    "aletheia_cot_proof_export": "enterprise",
    "aletheia_tool_monitoring": "enterprise",
    "aletheia_response_sanitizer": "enterprise",
    "aletheia_tool_policies": "enterprise",
    "aletheia_dashboard": "enterprise",
    # aletheia mssp
    "aletheia_cross_tenant_cot_audit": "mssp",
    "aletheia_managed_tool_policies": "mssp",
}

# Derive the old FEATURE_TIERS dict for backward compatibility (middleware uses FEATURE_MIN_TIER now)
FEATURE_TIERS: dict[str, list[str]] = {
    feature: [t for t in TIER_ORDER if _tier_rank(t) >= _tier_rank(min_tier)]
    for feature, min_tier in FEATURE_MIN_TIER.items()
}

# Map URL path prefixes to features
ROUTE_FEATURES: dict[str, str] = {
    "/v1/analytics": "analytics",
    "/v1/detection": "detection_rules",
    "/v1/enforcement": "enforcement",
    "/v1/integrations": "siem_forwarding",
    "/v1/mssp": "tenant_hierarchy",
    "/v1/saas": "managed_provisioning",
    "/v1/tenant": "white_label",
    "/v1/aletheia": "aletheia_cot_intercept",
}

# Paths that are always allowed regardless of license
ALWAYS_ALLOWED_PREFIXES = [
    "/v1/auth/",
    "/v1/trial/",
    "/v1/soulauth/admin/",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/metrics",
    "/",
]


def _get_feature_for_path(path: str) -> str | None:
    """Determine which feature a request path requires, if any."""
    for prefix, feature in ROUTE_FEATURES.items():
        if path.startswith(prefix):
            return feature
    return None


def _is_always_allowed(path: str) -> bool:
    """Check if a path is exempt from feature gating."""
    if path == "/":
        return True
    for prefix in ALWAYS_ALLOWED_PREFIXES:
        if prefix != "/" and path.startswith(prefix):
            return True
    return False


def _tier_has_feature(tier: str, feature: str) -> bool:
    """
    Check if a tier includes a given feature using the hierarchy.
    A tier passes if its rank >= the minimum tier rank for the feature.
    """
    min_tier = FEATURE_MIN_TIER.get(feature)
    if min_tier is None:
        return False
    return _tier_rank(tier) >= _tier_rank(min_tier)


def get_enabled_features(tier: str) -> list[str]:
    """Return all features enabled for a given tier."""
    return [f for f in FEATURE_MIN_TIER if _tier_has_feature(tier, f)]


class FeatureGateMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces tier-based feature gating.
    Checks app.state.license to determine the current tier.

    - Returns 402 for features not in the current tier (upgrade required).
    - Returns 403 for mssp/saas routes accessed with insufficient tier
      (these are separate SKUs, not just upgrades).
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
            return await call_next(request)

        # Get current tier from app state
        license_token: LicenseToken | None = getattr(request.app.state, "license", None)

        if license_token is None or license_token.status == LicenseStatus.MISSING:
            current_tier = "community"
        else:
            current_tier = license_token.tier

        # Check if current tier includes the required feature
        if _tier_has_feature(current_tier, feature):
            return await call_next(request)

        # Determine response code:
        # mssp/saas features return 403 (different SKU, not just higher tier)
        # Other features return 402 (upgrade to higher tier)
        required_tier = FEATURE_MIN_TIER.get(feature, "enterprise")
        is_sku_gate = required_tier in ("mssp", "saas")
        status_code = 403 if is_sku_gate else 402

        logger.warning(
            "feature_gate.blocked",
            path=path,
            feature=feature,
            tier_current=current_tier,
            tier_required=required_tier,
            status_code=status_code,
        )

        return JSONResponse(
            status_code=status_code,
            content={
                "error": "feature_not_licensed" if not is_sku_gate else "sku_required",
                "detail": (
                    f"Feature '{feature}' requires the {required_tier} tier or higher."
                    if not is_sku_gate
                    else f"Route requires the '{required_tier}' SKU. Current tier: '{current_tier}'."
                ),
                "feature": feature,
                "tier_required": required_tier,
                "tier_current": current_tier,
                "upgrade_url": "https://tiresias.saluca.com/pricing",
            },
        )
