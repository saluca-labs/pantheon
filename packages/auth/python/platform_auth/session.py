"""Postgres-backed session management."""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

SESSION_TTL_DAYS = 30


async def create_session(
    user_id: str,
    conn: AsyncConnection,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> dict:
    """Create a new session and return the session record."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)

    result = await conn.execute(
        text(
            """
            INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent)
            VALUES (:user_id, :token, :expires_at, :ip_address, :user_agent)
            RETURNING id, user_id, token, expires_at, created_at, ip_address, user_agent
            """
        ),
        {
            "user_id": user_id,
            "token": token,
            "expires_at": expires_at,
            "ip_address": ip_address,
            "user_agent": user_agent,
        },
    )
    row = result.mappings().first()
    if not row:
        raise RuntimeError("Failed to create session")
    return dict(row)


async def validate_session(
    token: str,
    conn: AsyncConnection,
) -> Optional[dict]:
    """
    Validate a session token. Returns the user+session dict or None
    if the token is missing, expired, or invalidated.
    """
    result = await conn.execute(
        text(
            """
            SELECT
              s.id AS session_id, s.user_id, s.token,
              s.expires_at, s.created_at, s.ip_address, s.user_agent,
              u.email, u.display_name, u.email_verified, u.organization_id,
              u.created_at AS user_created_at, u.updated_at AS user_updated_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = :token
              AND s.expires_at > NOW()
              AND s.invalidated_at IS NULL
            """
        ),
        {"token": token},
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def invalidate_session(token: str, conn: AsyncConnection) -> None:
    """Mark a session as invalidated (logout)."""
    await conn.execute(
        text("UPDATE sessions SET invalidated_at = NOW() WHERE token = :token"),
        {"token": token},
    )
