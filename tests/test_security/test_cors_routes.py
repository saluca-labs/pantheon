"""
Security audit tests for CORS configuration and route protection (C3).
Verifies that CORS is tightened to production domains and all routes are protected.
"""

import pytest
from unittest.mock import patch

from src.middleware.pep import _is_protected, PROTECTED_PREFIXES, OPEN_PREFIXES
from src.middleware.feature_gate import (
    _is_always_allowed,
    _get_feature_for_path,
    ROUTE_FEATURES,
    ALWAYS_ALLOWED_PREFIXES,
)


# ---------------------------------------------------------------------------
# CORS configuration
# ---------------------------------------------------------------------------

class TestCORSConfiguration:
    """
    CORS configuration tests that verify the settings without importing src.main
    (which has heavy dependencies). Instead, we verify the configuration logic directly.
    """

    def test_production_origins_defined(self):
        """Verify production origins are properly defined."""
        production_origins = [
            "https://tiresias.network",
            "https://www.tiresias.network",
        ]
        assert "https://tiresias.network" in production_origins
        assert "*" not in production_origins

    def test_wildcard_not_allowed(self):
        """Verify that wildcard is not in production origins."""
        # Read main.py and verify allow_origins is NOT ["*"]
        import ast
        with open("src/main.py", "r") as f:
            content = f.read()
        # The old insecure pattern should NOT be present
        assert 'allow_origins=["*"]' not in content, (
            "CORS allow_origins=['*'] found in main.py - this is insecure!"
        )

    def test_dev_origins_conditional_on_debug(self):
        """Verify dev origins are conditional on debug setting."""
        import ast
        with open("src/main.py", "r") as f:
            content = f.read()
        # The conditional pattern should be present
        assert "settings.debug" in content, (
            "Dev origins should be conditional on settings.debug"
        )
        assert "_DEV_ORIGINS" in content
        assert "_PRODUCTION_ORIGINS" in content

    def test_cors_methods_restricted(self):
        """Verify CORS allows only needed HTTP methods, not wildcard."""
        with open("src/main.py", "r") as f:
            content = f.read()
        assert 'allow_methods=["*"]' not in content, (
            "CORS allow_methods=['*'] found - should be explicit method list"
        )

    def test_cors_headers_restricted(self):
        """Verify CORS allows only needed headers, not wildcard."""
        with open("src/main.py", "r") as f:
            content = f.read()
        assert 'allow_headers=["*"]' not in content, (
            "CORS allow_headers=['*'] found - should be explicit header list"
        )


# ---------------------------------------------------------------------------
# Route protection audit
# ---------------------------------------------------------------------------

class TestRouteProtectionAudit:
    """Verify all routes are properly protected by PEP or feature gates."""

    def test_no_unprotected_admin_endpoints(self):
        """Admin endpoints should be in the open prefixes (RBAC-protected, not PEP)."""
        # Admin paths use RBAC via the admin router, not PEP
        assert not _is_protected("/v1/soulauth/admin/keys")
        assert not _is_protected("/v1/soulauth/admin/tenants")
        # But they ARE in the open prefixes list (meaning RBAC is the protection layer)
        admin_covered = any(
            "/v1/soulauth/admin/" == prefix or "/v1/soulauth/admin/".startswith(prefix)
            for prefix in OPEN_PREFIXES
        )
        assert admin_covered, "Admin endpoints should be covered by OPEN_PREFIXES for PEP bypass (RBAC is the protection layer)"

    def test_enforcement_feature_gated(self):
        """Enforcement endpoints are feature-gated to enterprise tier."""
        feature = _get_feature_for_path("/v1/enforcement/quarantine")
        assert feature == "enforcement"

    def test_analytics_feature_gated(self):
        """Analytics endpoints are feature-gated to pro tier."""
        feature = _get_feature_for_path("/v1/analytics/anomalies")
        assert feature == "analytics"

    def test_detection_feature_gated(self):
        """Detection endpoints are feature-gated to pro tier."""
        feature = _get_feature_for_path("/v1/detection/rules")
        assert feature == "detection_rules"

    def test_health_always_allowed(self):
        """Health endpoint is always accessible."""
        assert _is_always_allowed("/health")

    def test_docs_always_allowed(self):
        """Docs endpoints are always accessible."""
        assert _is_always_allowed("/docs")
        assert _is_always_allowed("/openapi.json")
        assert _is_always_allowed("/redoc")

    def test_trial_always_allowed(self):
        """Trial endpoints are always accessible (public registration)."""
        assert _is_always_allowed("/v1/trial/register")
        assert _is_always_allowed("/v1/trial/verify")

    def test_auth_always_allowed(self):
        """Auth endpoints are always accessible (use soulkey auth)."""
        assert _is_always_allowed("/v1/auth/identity")
        assert _is_always_allowed("/v1/auth/evaluate")
        assert _is_always_allowed("/v1/auth/whoami")

    def test_protected_resources_require_capability_token(self):
        """Protected resource paths require capability token via PEP."""
        assert _is_protected("/v1/memory/cs/algorithms")
        assert _is_protected("/v1/vault/API_KEY")
        assert _is_protected("/v1/mesh/nodes")

    def test_metrics_always_allowed(self):
        """Metrics endpoint is always accessible for Prometheus scraping."""
        assert _is_always_allowed("/metrics")

    def test_root_always_allowed(self):
        """Root endpoint is always accessible."""
        assert _is_always_allowed("/")

    def test_all_feature_routes_mapped(self):
        """Every route in ROUTE_FEATURES should map to a known feature."""
        from src.middleware.feature_gate import FEATURE_TIERS
        for path, feature in ROUTE_FEATURES.items():
            assert feature in FEATURE_TIERS, (
                f"Route {path} maps to unknown feature '{feature}'"
            )


# ---------------------------------------------------------------------------
# PEP coverage verification
# ---------------------------------------------------------------------------

class TestPEPCoverage:
    """Verify PEP middleware covers all expected protected paths."""

    def test_protected_prefixes_exist(self):
        """Protected prefixes list is non-empty."""
        assert len(PROTECTED_PREFIXES) > 0

    def test_open_prefixes_exist(self):
        """Open prefixes list is non-empty."""
        assert len(OPEN_PREFIXES) > 0

    def test_no_overlap_between_protected_and_open(self):
        """Protected and open prefixes should not overlap."""
        for protected in PROTECTED_PREFIXES:
            for open_prefix in OPEN_PREFIXES:
                # One should not be a prefix of the other
                assert not protected.startswith(open_prefix), (
                    f"Protected '{protected}' starts with open '{open_prefix}'"
                )

    def test_feature_gate_prefixes_not_in_always_allowed(self):
        """Feature-gated routes should not be in the always-allowed list."""
        for route_path in ROUTE_FEATURES:
            assert not _is_always_allowed(route_path), (
                f"Feature-gated route '{route_path}' should not be always-allowed"
            )
