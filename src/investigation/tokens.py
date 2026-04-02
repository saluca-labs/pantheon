"""
One-time investigation access tokens for Level 2 (cleartext) evidence access.
Tokens are SHA-256 hashed before storage. Raw token returned once at creation.
Single-use: consumed on first download, then marked spent.
"""

import os
import hashlib
import uuid
import structlog
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import select, update, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)


async def create_access_token(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    purpose: str,
    created_by: str,
    ttl_minutes: int = 60,
) -> dict:
    """Create a one-time investigation access token."""
    raw_token = f"inv_{os.urandom(32).hex()}"
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    token_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=ttl_minutes)

    await db.execute(text("""
        INSERT INTO _investigation_tokens (id, tenant_id, token_hash, purpose, created_by, expires_at, status, created_at)
        VALUES (:id, :tenant_id, :token_hash, :purpose, :created_by, :expires_at, 'active', :now)
    """), {
        "id": token_id,
        "tenant_id": str(tenant_id),
        "token_hash": token_hash,
        "purpose": purpose,
        "created_by": created_by,
        "expires_at": expires_at,
        "now": now,
    })
    await db.commit()

    logger.info("investigation.token_created", token_id=token_id, tenant_id=str(tenant_id), purpose=purpose)

    return {
        "token": raw_token,
        "token_id": token_id,
        "expires_at": expires_at.isoformat(),
        "purpose": purpose,
    }


async def validate_and_consume_token(
    db: AsyncSession,
    raw_token: str,
    tenant_id: uuid.UUID,
) -> Optional[dict]:
    """
    Validate a one-time token: check hash, expiry, status, tenant match.
    If valid, mark as 'spent' (single use) and return token metadata.
    Returns None if invalid.
    """
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    now = datetime.now(timezone.utc)

    result = await db.execute(text("""
        SELECT id, tenant_id, purpose, expires_at, status
        FROM _investigation_tokens
        WHERE token_hash = :hash AND status = 'active'
    """), {"hash": token_hash})
    row = result.first()

    if not row:
        logger.warning("investigation.token_invalid", reason="not_found_or_spent")
        return None

    token_id, stored_tenant, purpose, expires_at, status = row

    if str(stored_tenant) != str(tenant_id):
        logger.warning("investigation.token_tenant_mismatch", token_id=token_id)
        return None

    if now > expires_at:
        await db.execute(text(
            "UPDATE _investigation_tokens SET status = 'expired' WHERE id = :id"
        ), {"id": token_id})
        await db.commit()
        logger.warning("investigation.token_expired", token_id=token_id)
        return None

    # Consume: mark as spent
    await db.execute(text(
        "UPDATE _investigation_tokens SET status = 'spent', used_at = :now WHERE id = :id"
    ), {"id": token_id, "now": now})
    await db.commit()

    logger.info("investigation.token_consumed", token_id=token_id, tenant_id=str(tenant_id))
    return {"token_id": token_id, "purpose": purpose}
