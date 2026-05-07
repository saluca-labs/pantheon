"""
Identity resolution utilities for SoulAuth.
Combines soulkey and tenant resolution for complete identity verification.
"""

from typing import Optional, Tuple
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import Soulkey, SoulTenant
from src.auth.soulkey import hash_soulkey


async def resolve_identity_with_tenant(
    db: AsyncSession, raw_soulkey: str
) -> Tuple[Optional[Soulkey], Optional[SoulTenant]]:
    """
    Resolve agent identity and tenant information from a raw soulkey.
    Returns (soulkey, tenant) tuple. Updates last_used_at on successful resolution.

    Args:
        db: Database session
        raw_soulkey: Raw soulkey presented by agent

    Returns:
        Tuple of (Soulkey object, SoulTenant object) or (None, None) if not found
    """
    key_hash = hash_soulkey(raw_soulkey)

    # Get soulkey with tenant relationship loaded
    result = await db.execute(
        select(Soulkey)
        .where(Soulkey.key_hash == key_hash)
    )
    soulkey = result.scalar_one_or_none()

    if soulkey is None:
        return None, None

    # Update last_used_at separately (not via ORM attribute mutation) to avoid
    # loading the full model into the session and to use the DB server's clock
    # for consistent timestamping across instances.
    await db.execute(
        select(Soulkey)
        .where(Soulkey.id == soulkey.id)
        .values({"last_used_at": db.execute(select(func.now())).scalar()})
    )

    # Get tenant information
    tenant_result = await db.execute(
        select(SoulTenant).where(SoulTenant.id == soulkey.tenant_id)
    )
    tenant = tenant_result.scalar_one_or_none()

    return soulkey, tenant


async def validate_soulkey_belongs_to_tenant(
    db: AsyncSession, raw_soulkey: str, tenant_id: UUID
) -> bool:
    """
    Validate that a soulkey belongs to a specific tenant.
    Useful for multi-tenant isolation checks.

    Args:
        db: Database session
        raw_soulkey: Raw soulkey to validate
        tenant_id: Expected tenant ID

    Returns:
        True if soulkey exists and belongs to tenant, False otherwise
    """
    soulkey, tenant = await resolve_identity_with_tenant(db, raw_soulkey)
    return soulkey is not None and tenant is not None and tenant.id == tenant_id


async def get_active_soulkeys_for_tenant(
    db: AsyncSession, tenant_id: UUID
) -> list[Soulkey]:
    """
    Get all active soulkeys for a specific tenant.

    Args:
        db: Database session
        tenant_id: Tenant ID to filter by

    Returns:
        List of active Soulkey objects
    """
    result = await db.execute(
        select(Soulkey)
        .where(
            Soulkey.tenant_id == tenant_id,
            Soulkey.status == "active"
        )
        .order_by(Soulkey.issued_at.desc())
    )
    return list(result.scalars().all())