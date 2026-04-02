"""
License enforcement integration test matrix.
Covers 8 scenarios for the Tiresias license validation and relay system.

GitHub Issue #6: test: full license enforcement integration test matrix
"""

import os
import json
import hmac
import hashlib
import base64
import time
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from src.license.validator import LicenseValidator, LicenseStatus, LicenseToken
from src.license.relay import check_on_startup

# ---------- helpers ----------

TEST_SECRET = "test-license-secret-for-enforcement-matrix"


def _b64url_encode(data: bytes) -> str:
    """Base64url encode without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _build_jwt(claims: dict, secret: str = TEST_SECRET, algorithm: str = "HS256") -> str:
    """
    Build a minimal HS256 JWT for testing.
    If secret is empty string the signature will be invalid garbage.
    """
    header = {"alg": algorithm, "typ": "JWT"}
    header_b64 = _b64url_encode(json.dumps(header).encode())
    payload_b64 = _b64url_encode(json.dumps(claims).encode())

    signing_input = f"{header_b64}.{payload_b64}".encode()
    sig = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    sig_b64 = _b64url_encode(sig)

    return f"{header_b64}.{payload_b64}.{sig_b64}"


def _enterprise_nfr_claims(**overrides) -> dict:
    now = time.time()
    claims = {
        "sub": "nfr",
        "tier": "enterprise",
        "features": ["enforcement", "siem_forwarding", "audit_export", "multi_tenant"],
        "is_nfr": True,
        "iat": now,
        "exp": now + 86400 * 365,
    }
    claims.update(overrides)
    return claims


def _valid_claims(tier: str = "pro", **overrides) -> dict:
    now = time.time()
    claims = {
        "sub": "tenant-abc",
        "tier": tier,
        "features": ["analytics", "detection_rules"],
        "is_nfr": False,
        "partner_id": "partner-1",
        "iat": now,
        "exp": now + 86400 * 30,
    }
    claims.update(overrides)
    return claims


# ---------- fixtures ----------

@pytest.fixture(autouse=True)
def _set_license_secret(monkeypatch):
    """Ensure the test secret is available for JWT verification."""
    monkeypatch.setenv("TIRESIAS_LICENSE_SECRET", TEST_SECRET)


@pytest.fixture
def validator() -> LicenseValidator:
    return LicenseValidator(grace_hours=72.0, require_signature=True)


# ================================================================
# Scenario 1: No license key -> MISSING
# ================================================================

class TestNoLicenseKey:
    """When no license key is provided the validator must return MISSING."""

    def test_empty_string_returns_missing(self, validator):
        token = validator.validate("")
        assert token.status == LicenseStatus.MISSING
        assert not token.is_valid

    def test_none_returns_missing(self, validator):
        token = validator.validate(None)
        assert token.status == LicenseStatus.MISSING

    def test_whitespace_only_returns_missing(self, validator):
        token = validator.validate("   ")
        assert token.status == LicenseStatus.MISSING


# ================================================================
# Scenario 2: Valid NFR enterprise license
# ================================================================

class TestValidNfrEnterprise:
    """A valid NFR enterprise JWT should return VALID with correct fields."""

    def test_nfr_enterprise_is_valid(self, validator):
        jwt = _build_jwt(_enterprise_nfr_claims())
        token = validator.validate(jwt)

        assert token.status == LicenseStatus.VALID
        assert token.is_valid
        assert token.tier == "enterprise"
        assert token.is_enterprise
        assert token.is_nfr is True
        assert token.tenant_id == "nfr"

    def test_nfr_enterprise_has_features(self, validator):
        claims = _enterprise_nfr_claims()
        jwt = _build_jwt(claims)
        token = validator.validate(jwt)

        assert "enforcement" in token.features
        assert "siem_forwarding" in token.features

    def test_nfr_is_not_degraded(self, validator):
        jwt = _build_jwt(_enterprise_nfr_claims())
        token = validator.validate(jwt)
        assert not token.is_degraded


# ================================================================
# Scenario 3: Valid pro tier
# ================================================================

class TestValidProTier:
    """A valid pro-tier JWT should validate correctly."""

    def test_pro_tier_valid(self, validator):
        jwt = _build_jwt(_valid_claims(tier="pro"))
        token = validator.validate(jwt)

        assert token.status == LicenseStatus.VALID
        assert token.tier == "pro"
        assert token.is_nfr is False
        assert token.partner_id == "partner-1"
        assert token.tenant_id == "tenant-abc"

    def test_pro_tier_not_enterprise(self, validator):
        jwt = _build_jwt(_valid_claims(tier="pro"))
        token = validator.validate(jwt)
        assert not token.is_enterprise


# ================================================================
# Scenario 4: Valid starter tier
# ================================================================

class TestValidStarterTier:
    """A valid starter-tier JWT should validate correctly."""

    def test_starter_tier_valid(self, validator):
        jwt = _build_jwt(_valid_claims(tier="starter"))
        token = validator.validate(jwt)

        assert token.status == LicenseStatus.VALID
        assert token.tier == "starter"
        assert token.is_valid

    def test_starter_tier_preserves_claims(self, validator):
        claims = _valid_claims(tier="starter")
        jwt = _build_jwt(claims)
        token = validator.validate(jwt)

        assert token.issued_at == claims["iat"]
        assert token.expires_at == claims["exp"]
        assert token.raw_claims["sub"] == "tenant-abc"


# ================================================================
# Scenario 5: Expired within grace period -> GRACE
# ================================================================

class TestExpiredWithinGracePeriod:
    """A license expired less than grace_hours ago should return GRACE."""

    def test_recently_expired_returns_grace(self, validator):
        # Expired 1 hour ago (well within 72h grace)
        claims = _valid_claims(tier="enterprise", exp=time.time() - 3600)
        jwt = _build_jwt(claims)
        token = validator.validate(jwt)

        assert token.status == LicenseStatus.GRACE
        assert token.is_valid  # GRACE counts as valid
        assert token.is_degraded
        assert token.tier == "enterprise"

    def test_grace_period_boundary(self):
        """License expired exactly at 71 hours ago with 72h grace -> still GRACE."""
        v = LicenseValidator(grace_hours=72.0, require_signature=True)
        expired_71h_ago = time.time() - (71 * 3600)
        claims = _valid_claims(tier="pro", exp=expired_71h_ago)
        jwt = _build_jwt(claims)
        token = v.validate(jwt)

        assert token.status == LicenseStatus.GRACE
        assert token.grace_until is not None
        assert token.grace_until > time.time()

    def test_grace_preserves_features(self, validator):
        claims = _valid_claims(tier="pro", exp=time.time() - 60)
        jwt = _build_jwt(claims)
        token = validator.validate(jwt)

        assert token.features == claims["features"]


# ================================================================
# Scenario 6: Expired past grace period -> INVALID
# ================================================================

class TestExpiredPastGracePeriod:
    """A license expired longer than grace_hours ago should return INVALID."""

    def test_expired_past_grace_returns_invalid(self, validator):
        # Expired 100 hours ago (past 72h grace)
        claims = _valid_claims(tier="enterprise", exp=time.time() - (100 * 3600))
        jwt = _build_jwt(claims)
        token = validator.validate(jwt)

        assert token.status == LicenseStatus.INVALID
        assert not token.is_valid

    def test_expired_just_past_grace_boundary(self):
        """License expired exactly at 73 hours ago with 72h grace -> INVALID."""
        v = LicenseValidator(grace_hours=72.0, require_signature=True)
        expired_73h_ago = time.time() - (73 * 3600)
        claims = _valid_claims(tier="pro", exp=expired_73h_ago)
        jwt = _build_jwt(claims)
        token = v.validate(jwt)

        assert token.status == LicenseStatus.INVALID

    def test_custom_grace_hours(self):
        """With 0 grace hours, any expired token is immediately INVALID."""
        v = LicenseValidator(grace_hours=0, require_signature=True)
        claims = _valid_claims(tier="pro", exp=time.time() - 1)
        jwt = _build_jwt(claims)
        token = v.validate(jwt)

        assert token.status == LicenseStatus.INVALID


# ================================================================
# Scenario 7: Tampered JWT -> INVALID (signature verification fails)
# ================================================================

class TestTamperedJwt:
    """JWTs signed with the wrong secret or tampered with must return INVALID."""

    def test_wrong_secret_returns_invalid(self, validator):
        claims = _valid_claims(tier="enterprise")
        jwt = _build_jwt(claims, secret="wrong-secret-key")
        token = validator.validate(jwt)

        assert token.status == LicenseStatus.INVALID
        assert not token.is_valid

    def test_corrupted_signature_returns_invalid(self, validator):
        jwt = _build_jwt(_valid_claims())
        # Corrupt the signature portion
        parts = jwt.split(".")
        parts[2] = "AAAA" + parts[2][4:]
        corrupted = ".".join(parts)

        token = validator.validate(corrupted)
        assert token.status == LicenseStatus.INVALID

    def test_tampered_payload_returns_invalid(self, validator):
        jwt = _build_jwt(_valid_claims(tier="starter"))
        parts = jwt.split(".")
        # Decode payload, modify tier, re-encode WITHOUT re-signing
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=="))
        payload["tier"] = "enterprise"
        parts[1] = _b64url_encode(json.dumps(payload).encode())
        tampered = ".".join(parts)

        token = validator.validate(tampered)
        assert token.status == LicenseStatus.INVALID

    def test_missing_signature_secret_with_require(self, monkeypatch):
        """When TIRESIAS_LICENSE_SECRET is empty and require_signature=True -> INVALID."""
        monkeypatch.setenv("TIRESIAS_LICENSE_SECRET", "")
        v = LicenseValidator(grace_hours=72.0, require_signature=True)
        jwt = _build_jwt(_valid_claims())
        token = v.validate(jwt)
        assert token.status == LicenseStatus.INVALID

    def test_malformed_jwt_returns_invalid(self, validator):
        token = validator.validate("not.a.valid.jwt.at.all")
        assert token.status == LicenseStatus.INVALID

    def test_two_part_jwt_returns_invalid(self, validator):
        token = validator.validate("header.payload")
        assert token.status == LicenseStatus.INVALID


# ================================================================
# Scenario 8: NFR skips relay (check_on_startup not called for NFR)
# ================================================================

class TestNfrSkipsRelay:
    """NFR licenses must skip the phone-home relay entirely."""

    @pytest.mark.asyncio
    async def test_nfr_skips_relay_call(self):
        """check_on_startup should return the token unchanged for NFR, without HTTP calls."""
        nfr_token = LicenseToken(
            status=LicenseStatus.VALID,
            tier="enterprise",
            is_nfr=True,
            tenant_id="nfr",
        )

        with patch("src.license.relay._relay_renew", new_callable=AsyncMock) as mock_renew:
            result = await check_on_startup(nfr_token)
            mock_renew.assert_not_called()

        assert result is nfr_token
        assert result.status == LicenseStatus.VALID

    @pytest.mark.asyncio
    async def test_non_nfr_does_call_relay(self):
        """Non-NFR licenses SHOULD attempt the relay (even if it fails)."""
        non_nfr_token = LicenseToken(
            status=LicenseStatus.VALID,
            tier="pro",
            is_nfr=False,
            tenant_id="tenant-abc",
        )

        with patch("src.license.relay._relay_renew", new_callable=AsyncMock, return_value=None) as mock_renew:
            result = await check_on_startup(non_nfr_token)
            mock_renew.assert_called_once()

        # Original token returned when relay returns None
        assert result is non_nfr_token

    @pytest.mark.asyncio
    async def test_invalid_license_skips_relay(self):
        """Invalid licenses should not attempt relay at all."""
        invalid_token = LicenseToken(
            status=LicenseStatus.INVALID,
        )

        with patch("src.license.relay._relay_renew", new_callable=AsyncMock) as mock_renew:
            result = await check_on_startup(invalid_token)
            mock_renew.assert_not_called()

        assert result is invalid_token
