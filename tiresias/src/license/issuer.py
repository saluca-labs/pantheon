"""
License Issuer — creates, signs, and persists license JWTs.
Implements BILL-LIC-01.

Uses HMAC-SHA256 signing with TIRESIAS_LICENSE_SECRET (same key as validator).
Persists issued licenses to _soul_licenses for audit trail and DB-backed startup.
"""

import os
import json
import hmac
import hashlib
import base64
import time
import uuid
import structlog
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulLicense, SoulTenant
from src.tier import VALID_TIERS, DEFAULT_TIER
from src.license.validator import LicenseValidator, LicenseToken, LicenseStatus

logger = structlog.get_logger(__name__)


def _b64_encode(data: bytes) -> str:
    """Base64url encode without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _sign_jwt(claims: dict) -> str:
    """
    Create an HMAC-SHA256 signed JWT from claims dict.
    Requires TIRESIAS_LICENSE_SECRET env var.
    """
    secret = os.environ.get("TIRESIAS_LICENSE_SECRET", "")
    if not secret:
        raise RuntimeError("TIRESIAS_LICENSE_SECRET is required to issue licenses")

    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = _b64_encode(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = _b64_encode(json.dumps(claims, separators=(",", ":")).encode())

    signing_input = f"{header_b64}.{payload_b64}".encode()
    signature = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    signature_b64 = _b64_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


def _hash_jwt(jwt_str: str) -> str:
    """SHA-256 hash of the JWT string for dedup/lookup."""
    return hashlib.sha256(jwt_str.encode()).hexdigest()


async def issue_license(
    db: AsyncSession,
    *,
    tier: str,
    tenant_id: Optional[uuid.UUID] = None,
    features: Optional[list[str]] = None,
    is_nfr: bool = False,
    partner_id: Optional[str] = None,
    validity_days: int = 365,
    issued_by: str = "admin",
    grace_hours: float = 72.0,
) -> dict:
    """
    Issue a new signed license JWT and persist to _soul_licenses.

    Args:
        db: Async DB session
        tier: License tier (must be in VALID_TIERS)
        tenant_id: Target tenant (None for install-level licenses)
        features: Feature flags to include
        is_nfr: Not-for-resale / demo license
        partner_id: Partner identifier
        validity_days: License validity in days
        issued_by: Issuer identity for audit
        grace_hours: Grace period hours after expiry

    Returns:
        Dict with license_id, jwt, tier, expires_at, status
    """
    if tier not in VALID_TIERS:
        raise ValueError(f"Invalid tier: {tier}. Must be one of {VALID_TIERS}")

    if features is None:
        features = []

    now = time.time()
    now_dt = datetime.now(timezone.utc)
    expires_at = now + (validity_days * 86400)
    expires_dt = now_dt + timedelta(days=validity_days)
    grace_until_dt = expires_dt + timedelta(hours=grace_hours)

    # Verify tenant exists if specified
    if tenant_id:
        result = await db.execute(select(SoulTenant).where(SoulTenant.id == tenant_id))
        tenant = result.scalar_one_or_none()
        if not tenant:
            raise ValueError(f"Tenant {tenant_id} not found")

    # Build JWT claims
    claims = {
        "sub": str(tenant_id) if tenant_id else "install",
        "tier": tier,
        "features": features,
        "is_nfr": is_nfr,
        "iat": int(now),
        "exp": int(expires_at),
    }
    if partner_id:
        claims["partner_id"] = partner_id

    # Sign JWT
    jwt_str = _sign_jwt(claims)
    key_hash = _hash_jwt(jwt_str)

    # Persist to DB
    license_id = uuid.uuid4()
    license_record = SoulLicense(
        id=license_id,
        tenant_id=tenant_id,
        license_key_hash=key_hash,
        tier=tier,
        features=features,
        is_nfr=is_nfr,
        partner_id=partner_id,
        issued_at=now_dt,
        expires_at=expires_dt,
        grace_until=grace_until_dt,
        status="active",
        jwt_claims=claims,
        issued_by=issued_by,
    )
    db.add(license_record)
    await db.commit()

    logger.info(
        "license.issued",
        license_id=str(license_id),
        tenant_id=str(tenant_id) if tenant_id else "install",
        tier=tier,
        is_nfr=is_nfr,
        validity_days=validity_days,
        issued_by=issued_by,
    )

    return {
        "license_id": str(license_id),
        "jwt": jwt_str,
        "tier": tier,
        "features": features,
        "is_nfr": is_nfr,
        "tenant_id": str(tenant_id) if tenant_id else None,
        "partner_id": partner_id,
        "issued_at": now_dt.isoformat(),
        "expires_at": expires_dt.isoformat(),
        "grace_until": grace_until_dt.isoformat(),
        "status": "active",
    }


async def revoke_license(
    db: AsyncSession,
    license_id: uuid.UUID,
    revoked_by: str = "admin",
) -> dict:
    """Revoke a license by ID."""
    result = await db.execute(select(SoulLicense).where(SoulLicense.id == license_id))
    lic = result.scalar_one_or_none()
    if not lic:
        raise ValueError(f"License {license_id} not found")
    if lic.status == "revoked":
        raise ValueError(f"License {license_id} is already revoked")

    now = datetime.now(timezone.utc)
    await db.execute(
        update(SoulLicense)
        .where(SoulLicense.id == license_id)
        .values(status="revoked", revoked_at=now, revoked_by=revoked_by)
    )
    await db.commit()

    logger.info("license.revoked", license_id=str(license_id), revoked_by=revoked_by)
    return {"license_id": str(license_id), "status": "revoked", "revoked_by": revoked_by}


async def get_active_license(
    db: AsyncSession,
    tenant_id: Optional[uuid.UUID] = None,
) -> Optional[SoulLicense]:
    """
    Get the most recent active license for a tenant (or install-level if tenant_id is None).
    Returns None if no active license found.
    """
    query = (
        select(SoulLicense)
        .where(SoulLicense.status == "active")
        .order_by(SoulLicense.created_at.desc())
        .limit(1)
    )
    if tenant_id:
        query = query.where(SoulLicense.tenant_id == tenant_id)
    else:
        query = query.where(SoulLicense.tenant_id.is_(None))

    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_licenses_for_tenant(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    include_revoked: bool = False,
) -> list[dict]:
    """Query all licenses for a tenant."""
    query = (
        select(SoulLicense)
        .where(SoulLicense.tenant_id == tenant_id)
        .order_by(SoulLicense.created_at.desc())
    )
    if not include_revoked:
        query = query.where(SoulLicense.status != "revoked")

    result = await db.execute(query)
    licenses = result.scalars().all()

    return [
        {
            "license_id": str(lic.id),
            "tier": lic.tier,
            "features": lic.features,
            "is_nfr": lic.is_nfr,
            "partner_id": lic.partner_id,
            "issued_at": lic.issued_at.isoformat() if lic.issued_at else None,
            "expires_at": lic.expires_at.isoformat() if lic.expires_at else None,
            "status": lic.status,
            "issued_by": lic.issued_by,
            "revoked_at": lic.revoked_at.isoformat() if lic.revoked_at else None,
        }
        for lic in licenses
    ]
