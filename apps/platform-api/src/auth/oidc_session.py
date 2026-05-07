"""
OIDC session management — create, validate, and revoke portal sessions.
Sessions are stored in _soul_oidc_sessions as SHA-256 hashed tokens.
"""

import hashlib
import secrets
import structlog
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulOIDCSession, SoulUser
from config.settings import get_settings

logger = structlog.get_logger(__name__)


def _hash_token(raw_token: str) -> str:
    """Hash a session token with SHA-256 for storage."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


async def create_session(
    db: AsyncSession,
    user: SoulUser,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    refresh_token_enc: Optional[str] = None,
) -> tuple[str, SoulOIDCSession]:
    """
    Create a new OIDC portal session.
    Returns (raw_session_token, SoulOIDCSession) — raw token is shown once.
    """
    settings = get_settings()
    raw_token = secrets.token_urlsafe(48)
    token_hash = _hash_token(raw_token)

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=settings.oidc_session_ttl)

    session = SoulOIDCSession(
        user_id=user.id,
        tenant_id=user.tenant_id,
        session_token=token_hash,
        refresh_token_enc=refresh_token_enc,
        issued_at=now,
        expires_at=expires_at,
        last_active=now,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)

    logger.info(
        "oidc_session.created",
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        expires_at=expires_at.isoformat(),
    )
    return raw_token, session


async def validate_session(
    db: AsyncSession,
    raw_token: str,
) -> Optional[tuple[SoulOIDCSession, SoulUser]]:
    """
    Validate a portal session token.
    Returns (SoulOIDCSession, SoulUser) if valid, None otherwise.
    Updates last_active on valid sessions.
    """
    token_hash = _hash_token(raw_token)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(SoulOIDCSession).where(
            SoulOIDCSession.session_token == token_hash,
            SoulOIDCSession.expires_at > now,
            SoulOIDCSession.revoked_at.is_(None),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        return None

    # Load associated user
    user_result = await db.execute(
        select(SoulUser).where(SoulUser.id == session.user_id)
    )
    user = user_result.scalar_one_or_none()
    if not user or user.status != "active":
        logger.warning(
            "oidc_session.user_inactive",
            user_id=str(session.user_id),
        )
        return None

    # Update last_active
    await db.execute(
        update(SoulOIDCSession)
        .where(SoulOIDCSession.id == session.id)
        .values(last_active=now)
    )
    session.last_active = now

    return session, user


async def revoke_session(
    db: AsyncSession,
    raw_token: str,
) -> bool:
    """
    Revoke a portal session by setting revoked_at.
    Returns True if a session was found and revoked.
    """
    token_hash = _hash_token(raw_token)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        update(SoulOIDCSession)
        .where(
            SoulOIDCSession.session_token == token_hash,
            SoulOIDCSession.revoked_at.is_(None),
        )
        .values(revoked_at=now)
        .returning(SoulOIDCSession.id)
    )
    revoked_id = result.scalar_one_or_none()
    if revoked_id:
        logger.info("oidc_session.revoked", session_id=str(revoked_id))
        return True
    return False


async def revoke_session_by_id(
    db: AsyncSession,
    session_id: UUID,
) -> bool:
    """Revoke a session by its database ID."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        update(SoulOIDCSession)
        .where(
            SoulOIDCSession.id == session_id,
            SoulOIDCSession.revoked_at.is_(None),
        )
        .values(revoked_at=now)
        .returning(SoulOIDCSession.id)
    )
    return result.scalar_one_or_none() is not None
