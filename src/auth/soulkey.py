"""
Soulkey generation and identity resolution.
Implements SPEC.md section 3 - Identity Layer.
"""

import hashlib
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import Soulkey, SoulTenant


def generate_soulkey(tenant_short: str, persona_slug: str) -> tuple[str, str]:
    """
    Generate a new soulkey.
    Returns (raw_key, key_hash). Raw key shown once, never stored.
    Format: sk_agent_<tenant_short>_<persona_slug>_<hex32>
    """
    raw = f"sk_agent_{tenant_short}_{persona_slug}_{secrets.token_hex(32)}"
    hashed = hashlib.sha512(raw.encode()).hexdigest()
    return raw, hashed


def hash_soulkey(raw_key: str) -> str:
    """Hash a raw soulkey using SHA-512."""
    return hashlib.sha512(raw_key.encode()).hexdigest()


async def resolve_identity(db: AsyncSession, raw_key: str) -> Optional[Soulkey]:
    """
    Resolve agent identity from a raw soulkey.
    Updates last_used_at on successful resolution.
    """
    key_hash = hash_soulkey(raw_key)
    result = await db.execute(select(Soulkey).where(Soulkey.key_hash == key_hash))
    soulkey = result.scalar_one_or_none()

    if soulkey is None:
        return None

    await db.execute(
        update(Soulkey)
        .where(Soulkey.id == soulkey.id)
        .values(last_used_at=datetime.now(timezone.utc))
    )
    return soulkey


async def issue_soulkey(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    persona_id: str,
    tenant_short: str,
    label: Optional[str] = None,
    expires_at: Optional[datetime] = None,
    metadata: Optional[dict] = None,
) -> tuple[str, Soulkey]:
    """Issue a new soulkey. Returns (raw_key, soulkey_record)."""
    raw_key, key_hash = generate_soulkey(tenant_short, persona_id)

    soulkey = Soulkey(
        tenant_id=tenant_id,
        persona_id=persona_id,
        key_hash=key_hash,
        label=label or f"Soulkey for {persona_id}",
        status="active",
        expires_at=expires_at,
        metadata_=metadata or {},
    )
    db.add(soulkey)
    await db.flush()
    await db.refresh(soulkey)
    return raw_key, soulkey


async def suspend_soulkey(
    db: AsyncSession, soulkey_id: uuid.UUID, suspended_by: str, reason: Optional[str] = None
) -> Optional[Soulkey]:
    """Suspend an active soulkey. Reversible."""
    result = await db.execute(
        select(Soulkey).where(Soulkey.id == soulkey_id, Soulkey.status == "active")
    )
    soulkey = result.scalar_one_or_none()
    if not soulkey:
        return None

    now = datetime.now(timezone.utc)
    await db.execute(
        update(Soulkey).where(Soulkey.id == soulkey_id).values(
            status="suspended", suspended_at=now, suspended_by=suspended_by
        )
    )
    soulkey.status = "suspended"
    soulkey.suspended_at = now
    soulkey.suspended_by = suspended_by
    return soulkey


async def reinstate_soulkey(db: AsyncSession, soulkey_id: uuid.UUID) -> Optional[Soulkey]:
    """Reinstate a suspended soulkey back to active."""
    result = await db.execute(
        select(Soulkey).where(Soulkey.id == soulkey_id, Soulkey.status == "suspended")
    )
    soulkey = result.scalar_one_or_none()
    if not soulkey:
        return None

    await db.execute(
        update(Soulkey).where(Soulkey.id == soulkey_id).values(
            status="active", suspended_at=None, suspended_by=None
        )
    )
    soulkey.status = "active"
    return soulkey


async def revoke_soulkey(
    db: AsyncSession, soulkey_id: uuid.UUID, revoked_by: str, reason: str
) -> Optional[Soulkey]:
    """Permanently revoke a soulkey. Terminal state."""
    result = await db.execute(
        select(Soulkey).where(
            Soulkey.id == soulkey_id, Soulkey.status.in_(["active", "suspended"])
        )
    )
    soulkey = result.scalar_one_or_none()
    if not soulkey:
        return None

    now = datetime.now(timezone.utc)
    await db.execute(
        update(Soulkey).where(Soulkey.id == soulkey_id).values(
            status="revoked", revoked_at=now, revoked_by=revoked_by, revocation_reason=reason
        )
    )
    soulkey.status = "revoked"
    soulkey.revoked_at = now
    return soulkey


async def list_soulkeys(
    db: AsyncSession, tenant_id: uuid.UUID,
    status: Optional[str] = None, persona_id: Optional[str] = None,
) -> list[Soulkey]:
    """List soulkeys for a tenant, optionally filtered."""
    query = select(Soulkey).where(Soulkey.tenant_id == tenant_id)
    if status:
        query = query.where(Soulkey.status == status)
    if persona_id:
        query = query.where(Soulkey.persona_id == persona_id)
    query = query.order_by(Soulkey.issued_at.desc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def check_key_expiry(db: AsyncSession, soulkey: Soulkey) -> bool:
    """
    Check if a soulkey has expired. Revokes (not suspends) expired keys
    to prevent reinstatement of expired credentials. Returns True if valid.
    """
    if soulkey.expires_at:
        exp = soulkey.expires_at
        now = datetime.now(timezone.utc)
        # Handle naive datetimes (SQLite) by making them UTC-aware
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < now:
            # Revoke with reason "expired" - terminal state, cannot be reinstated
            await revoke_soulkey(db, soulkey.id, "system:expiry", "Key expired")
            return False
    return True
