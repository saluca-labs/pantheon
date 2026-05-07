"""
Tiresias Proxy API Key generation and management.

Keys follow the format: tir_<tenant_slug>_<hex32>
The raw key is shown once at provisioning. Only the SHA-256 hash is stored.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.tiresias.storage.schema import TiresiasLicense

logger = structlog.get_logger(__name__)


def generate_proxy_key(tenant_slug: str) -> tuple[str, str]:
    """Generate a Tiresias proxy API key.

    Returns:
        (raw_key, key_hash) — raw_key is shown once, key_hash is stored.
    """
    slug_part = tenant_slug[:16].lower().replace(" ", "-")
    random_part = secrets.token_hex(32)
    raw_key = f"tir_{slug_part}_{random_part}"
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    return raw_key, key_hash


async def provision_proxy_key(
    db: AsyncSession,
    tenant_id: str,
    tenant_slug: str,
    tier: str = "starter",
) -> str:
    """Generate and store a proxy API key for a tenant.

    Creates or updates the tiresias_licenses row with the key hash.
    Returns the raw key (shown once to the customer).
    """
    raw_key, key_hash = generate_proxy_key(tenant_slug)

    # Check if a license row already exists (from DEK provisioning)
    result = await db.execute(
        select(TiresiasLicense).where(TiresiasLicense.tenant_id == tenant_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Update existing row with the API key hash
        await db.execute(
            update(TiresiasLicense)
            .where(TiresiasLicense.tenant_id == tenant_id)
            .values(
                api_key_hash=key_hash,
                tier=tier,
                issued_at=datetime.now(timezone.utc),
            )
        )
    else:
        # Create new license row
        license_row = TiresiasLicense(
            tenant_id=tenant_id,
            tier=tier,
            kek_provider="gcp-sm",
            api_key_hash=key_hash,
            issued_at=datetime.now(timezone.utc),
        )
        db.add(license_row)

    await db.flush()

    logger.info(
        "proxy_key.provisioned",
        tenant_id=tenant_id,
        tenant_slug=tenant_slug,
        tier=tier,
    )

    return raw_key


async def rotate_proxy_key(
    db: AsyncSession,
    tenant_id: str,
    tenant_slug: str,
) -> str:
    """Rotate a tenant's proxy API key. Returns the new raw key.

    The old key is immediately invalidated (hash overwritten).
    """
    raw_key, key_hash = generate_proxy_key(tenant_slug)

    result = await db.execute(
        update(TiresiasLicense)
        .where(TiresiasLicense.tenant_id == tenant_id)
        .values(
            api_key_hash=key_hash,
            issued_at=datetime.now(timezone.utc),
        )
    )

    if result.rowcount == 0:
        raise ValueError(f"No license found for tenant {tenant_id}")

    await db.flush()

    logger.info("proxy_key.rotated", tenant_id=tenant_id)
    return raw_key


async def revoke_proxy_key(
    db: AsyncSession,
    tenant_id: str,
) -> None:
    """Revoke a tenant's proxy API key (set hash to NULL)."""
    result = await db.execute(
        update(TiresiasLicense)
        .where(TiresiasLicense.tenant_id == tenant_id)
        .values(api_key_hash=None)
    )

    if result.rowcount == 0:
        raise ValueError(f"No license found for tenant {tenant_id}")

    await db.flush()
    logger.info("proxy_key.revoked", tenant_id=tenant_id)
