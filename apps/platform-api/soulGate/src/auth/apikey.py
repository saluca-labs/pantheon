"""
API key issuance, hashing (bcrypt), and rotation.
"""

import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

import bcrypt
import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from soulGate.src.database.models import SoulGateAPIKey

logger = structlog.get_logger(__name__)

# API key format: sg_<random_hex_48>
_KEY_PREFIX_LEN = 8  # First 8 chars used for quick lookup


def generate_api_key() -> tuple[str, str, str]:
    """
    Generate a new SoulGate API key.
    Returns (raw_key, key_hash, key_prefix).
    The raw key is shown once and never stored.
    """
    raw_key = f"sg_{secrets.token_hex(48)}"
    key_hash = bcrypt.hashpw(raw_key.encode(), bcrypt.gensalt()).decode()
    key_prefix = raw_key[:_KEY_PREFIX_LEN]
    return raw_key, key_hash, key_prefix


def verify_api_key(raw_key: str, stored_hash: str) -> bool:
    """Verify a raw API key against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(raw_key.encode(), stored_hash.encode())
    except Exception:
        return False


async def issue_api_key(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    label: str,
    scopes: Optional[list[str]] = None,
    rate_limit_override: Optional[dict] = None,
    created_by: Optional[str] = None,
    expires_at: Optional[datetime] = None,
) -> tuple[str, SoulGateAPIKey]:
    """
    Issue a new API key.
    Returns (raw_key, key_record). Raw key shown once.
    """
    raw_key, key_hash, key_prefix = generate_api_key()

    key_record = SoulGateAPIKey(
        tenant_id=tenant_id,
        label=label,
        key_hash=key_hash,
        key_prefix=key_prefix,
        scopes=scopes or [],
        rate_limit_override=rate_limit_override,
        created_by=created_by,
        expires_at=expires_at,
    )
    db.add(key_record)
    await db.flush()
    await db.refresh(key_record)

    logger.info("apikey.issued", key_id=str(key_record.id), label=label, tenant_id=str(tenant_id))
    return raw_key, key_record


async def rotate_api_key(
    db: AsyncSession,
    key_id: uuid.UUID,
) -> Optional[tuple[str, SoulGateAPIKey]]:
    """
    Rotate an API key - generates new credentials for the same record.
    Returns (new_raw_key, updated_record) or None if key not found.
    """
    result = await db.execute(
        select(SoulGateAPIKey).where(
            SoulGateAPIKey.id == key_id,
            SoulGateAPIKey.status == "active",
        )
    )
    key_record = result.scalar_one_or_none()
    if not key_record:
        return None

    raw_key, key_hash, key_prefix = generate_api_key()

    await db.execute(
        update(SoulGateAPIKey)
        .where(SoulGateAPIKey.id == key_id)
        .values(
            key_hash=key_hash,
            key_prefix=key_prefix,
            rotated_at=datetime.now(timezone.utc),
        )
    )

    key_record.key_hash = key_hash
    key_record.key_prefix = key_prefix
    key_record.rotated_at = datetime.now(timezone.utc)

    logger.info("apikey.rotated", key_id=str(key_id))
    return raw_key, key_record


async def revoke_api_key(
    db: AsyncSession,
    key_id: uuid.UUID,
) -> bool:
    """Revoke an API key. Returns True if revoked, False if not found."""
    result = await db.execute(
        select(SoulGateAPIKey).where(
            SoulGateAPIKey.id == key_id,
            SoulGateAPIKey.status == "active",
        )
    )
    key_record = result.scalar_one_or_none()
    if not key_record:
        return False

    now = datetime.now(timezone.utc)
    await db.execute(
        update(SoulGateAPIKey)
        .where(SoulGateAPIKey.id == key_id)
        .values(status="revoked", revoked_at=now)
    )

    logger.info("apikey.revoked", key_id=str(key_id))
    return True
