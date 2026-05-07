"""
License JWT validation for Tiresias platform.
Validates license keys at startup and enforces tier/feature access.

License JWT claims:
  sub: tenant_id or "nfr"
  tier: "starter" | "pro" | "enterprise"
  features: list[str]
  is_nfr: bool (not-for-resale / demo license)
  partner_id: optional partner identifier
  iat: issued-at timestamp
  exp: expiry timestamp
"""

import os
import json
import hmac
import hashlib
import base64
import time
import structlog
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from src.tier import VALID_TIERS

logger = structlog.get_logger(__name__)


class LicenseStatus(str, Enum):
    VALID = "valid"
    GRACE = "grace"
    INVALID = "invalid"
    MISSING = "missing"


@dataclass
class LicenseToken:
    """Decoded and validated license information."""
    status: LicenseStatus
    tier: str = "starter"
    features: list[str] = field(default_factory=list)
    is_nfr: bool = False
    partner_id: Optional[str] = None
    tenant_id: Optional[str] = None
    issued_at: Optional[float] = None
    expires_at: Optional[float] = None
    grace_until: Optional[float] = None
    raw_claims: dict = field(default_factory=dict)

    @property
    def is_valid(self) -> bool:
        return self.status in (LicenseStatus.VALID, LicenseStatus.GRACE)

    @property
    def is_enterprise(self) -> bool:
        return self.tier == "enterprise"

    @property
    def is_degraded(self) -> bool:
        return self.status == LicenseStatus.GRACE


def _b64_decode(data: str) -> bytes:
    """Decode base64url without padding."""
    padding = 4 - len(data) % 4
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data)


def _decode_jwt_claims(token: str, require_signature: bool = True) -> dict:
    """
    Decode and verify JWT payload claims.
    Uses HMAC-SHA256 with the TIRESIAS_LICENSE_SECRET for signature verification.

    Args:
        token: The JWT string to decode.
        require_signature: If True (default), reject tokens when no secret is configured.
                          Only set to False for debug/development mode.
    """
    parts = token.strip().split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT format: expected 3 dot-separated parts")

    # Verify algorithm header
    try:
        header_bytes = _b64_decode(parts[0])
        header = json.loads(header_bytes)
    except (json.JSONDecodeError, Exception) as e:
        raise ValueError(f"Invalid JWT header: {e}")

    # Only accept HS256 algorithm
    if header.get("alg") != "HS256":
        raise ValueError(
            f"Unsupported JWT algorithm '{header.get('alg')}'. Only HS256 is accepted."
        )

    try:
        payload_bytes = _b64_decode(parts[1])
        claims = json.loads(payload_bytes)
    except (json.JSONDecodeError, Exception) as e:
        raise ValueError(f"Invalid JWT payload: {e}")

    # Verify HMAC signature - REQUIRED in non-debug mode
    license_secret = os.environ.get("TIRESIAS_LICENSE_SECRET", "")
    if license_secret:
        signing_input = f"{parts[0]}.{parts[1]}".encode()
        expected_sig = hmac.new(
            license_secret.encode(), signing_input, hashlib.sha256
        ).digest()
        try:
            actual_sig = _b64_decode(parts[2])
        except Exception:
            raise ValueError("Invalid JWT signature encoding")
        if not hmac.compare_digest(expected_sig, actual_sig):
            raise ValueError("JWT signature verification failed")
    elif require_signature:
        raise ValueError(
            "TIRESIAS_LICENSE_SECRET is not configured. Cannot verify license "
            "signature. Set the environment variable or disable license_required."
        )
    else:
        logger.warning(
            "license.no_secret",
            message="Decoding license JWT without signature verification (debug mode)",
        )

    # Require essential claims
    required_claims = {"exp", "sub", "tier"}
    missing = required_claims - set(claims.keys())
    if missing:
        raise ValueError(f"Missing required license claims: {', '.join(missing)}")

    return claims


def _validate_claims_structure(claims: dict) -> None:
    """Validate that required claims are present and well-formed."""
    required = ["sub", "tier", "exp"]
    missing = [k for k in required if k not in claims]
    if missing:
        raise ValueError(f"Missing required license claims: {', '.join(missing)}")

    if claims["tier"] not in VALID_TIERS:
        raise ValueError(f"Invalid tier '{claims['tier']}', must be one of {VALID_TIERS}")

    if not isinstance(claims["exp"], (int, float)):
        raise ValueError("Invalid 'exp' claim: must be a numeric timestamp")


class LicenseValidator:
    """Validates Tiresias license JWTs and manages grace periods."""

    def __init__(self, grace_hours: float = 72.0, require_signature: bool = True):
        self.grace_hours = grace_hours
        self.grace_seconds = grace_hours * 3600
        self.require_signature = require_signature

    def validate(self, license_key: str) -> LicenseToken:
        """
        Validate a license JWT and return a LicenseToken.

        Returns:
            LicenseToken with status VALID, GRACE, or INVALID.
        """
        if not license_key or not license_key.strip():
            return LicenseToken(status=LicenseStatus.MISSING)

        try:
            claims = _decode_jwt_claims(license_key, require_signature=self.require_signature)
            _validate_claims_structure(claims)
        except ValueError as e:
            logger.error("license.validation_failed", error=str(e))
            return LicenseToken(status=LicenseStatus.INVALID)

        now = time.time()
        exp = claims["exp"]
        tier = claims["tier"]
        features = claims.get("features", [])
        is_nfr = claims.get("is_nfr", False)
        partner_id = claims.get("partner_id")
        tenant_id = claims.get("sub")
        iat = claims.get("iat")

        # Check expiry
        if now > exp:
            # Within grace period?
            grace_until = exp + self.grace_seconds
            if now <= grace_until:
                logger.warning(
                    "license.grace_period",
                    tier=tier,
                    expired_at=exp,
                    grace_until=grace_until,
                    hours_remaining=round((grace_until - now) / 3600, 1),
                )
                return LicenseToken(
                    status=LicenseStatus.GRACE,
                    tier=tier,
                    features=features,
                    is_nfr=is_nfr,
                    partner_id=partner_id,
                    tenant_id=tenant_id,
                    issued_at=iat,
                    expires_at=exp,
                    grace_until=grace_until,
                    raw_claims=claims,
                )
            else:
                logger.error(
                    "license.expired_past_grace",
                    tier=tier,
                    expired_at=exp,
                    grace_ended=grace_until,
                )
                return LicenseToken(status=LicenseStatus.INVALID)

        # Valid license
        logger.info(
            "license.valid",
            tier=tier,
            is_nfr=is_nfr,
            features_count=len(features),
            days_remaining=round((exp - now) / 86400, 1),
        )
        return LicenseToken(
            status=LicenseStatus.VALID,
            tier=tier,
            features=features,
            is_nfr=is_nfr,
            partner_id=partner_id,
            tenant_id=tenant_id,
            issued_at=iat,
            expires_at=exp,
            raw_claims=claims,
        )

    def validate_with_grace(self, license_key: str) -> LicenseToken:
        """
        Validate license with grace period support.
        Same as validate() but logs additional context for operational monitoring.
        """
        token = self.validate(license_key)

        if token.status == LicenseStatus.GRACE:
            logger.warning(
                "license.operating_degraded",
                tier=token.tier,
                message=(
                    f"License expired but within {self.grace_hours}h grace period. "
                    "Renew license to restore full operation."
                ),
            )

        return token
