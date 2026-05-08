"""
One-time token utilities for password reset and email verification.

Tokens are 32-byte URL-safe random strings hashed with SHA-256 before being
stored. The plain token is mailed to the user; the hash is what we look up.
This means a database leak does not yield usable reset tokens.

Token tables (created by migration in v3):
    _platform_password_reset_tokens
    _platform_email_verification_tokens

Both share the same shape:
    token_hash      text PK
    user_id         uuid  (FK soft — we use generic users.id)
    expires_at      timestamptz
    consumed_at     timestamptz NULL
    created_at      timestamptz default now()
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

# Default TTLs — overridable via env if needed.
PASSWORD_RESET_TTL_MINUTES = 60
EMAIL_VERIFICATION_TTL_HOURS = 24

_PASSWORD_RESET_TABLE = "_platform_password_reset_tokens"
_EMAIL_VERIFICATION_TABLE = "_platform_email_verification_tokens"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _generate() -> str:
    """Return a 43-char URL-safe random token (32 bytes)."""
    return secrets.token_urlsafe(32)


# ── Password reset ─────────────────────────────────────────────────────────


async def issue_password_reset_token(
    user_id: str,
    conn: AsyncConnection,
    ttl_minutes: int = PASSWORD_RESET_TTL_MINUTES,
) -> str:
    """Issue a single-use password reset token. Returns the *plain* token."""
    plain = _generate()
    token_hash = _hash(plain)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    await conn.execute(
        text(
            f"""
            INSERT INTO {_PASSWORD_RESET_TABLE} (token_hash, user_id, expires_at)
            VALUES (:token_hash, :user_id, :expires_at)
            """
        ),
        {"token_hash": token_hash, "user_id": user_id, "expires_at": expires_at},
    )
    return plain


async def consume_password_reset_token(
    token: str, conn: AsyncConnection
) -> Optional[str]:
    """
    Consume a password reset token. Returns the user_id on success, None
    on failure (unknown / expired / already-consumed). The token can be
    used at most once.
    """
    token_hash = _hash(token)
    result = await conn.execute(
        text(
            f"""
            UPDATE {_PASSWORD_RESET_TABLE}
            SET consumed_at = CURRENT_TIMESTAMP
            WHERE token_hash = :token_hash
              AND consumed_at IS NULL
              AND expires_at > CURRENT_TIMESTAMP
            RETURNING user_id
            """
        ),
        {"token_hash": token_hash},
    )
    row = result.first()
    return str(row[0]) if row else None


# ── Email verification ─────────────────────────────────────────────────────


async def issue_email_verification_token(
    user_id: str,
    conn: AsyncConnection,
    ttl_hours: int = EMAIL_VERIFICATION_TTL_HOURS,
) -> str:
    """Issue a single-use email verification token. Returns the *plain* token."""
    plain = _generate()
    token_hash = _hash(plain)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=ttl_hours)
    await conn.execute(
        text(
            f"""
            INSERT INTO {_EMAIL_VERIFICATION_TABLE} (token_hash, user_id, expires_at)
            VALUES (:token_hash, :user_id, :expires_at)
            """
        ),
        {"token_hash": token_hash, "user_id": user_id, "expires_at": expires_at},
    )
    return plain


async def consume_email_verification_token(
    token: str, conn: AsyncConnection
) -> Optional[str]:
    """
    Consume an email verification token. Returns the user_id on success,
    None on failure.
    """
    token_hash = _hash(token)
    result = await conn.execute(
        text(
            f"""
            UPDATE {_EMAIL_VERIFICATION_TABLE}
            SET consumed_at = CURRENT_TIMESTAMP
            WHERE token_hash = :token_hash
              AND consumed_at IS NULL
              AND expires_at > CURRENT_TIMESTAMP
            RETURNING user_id
            """
        ),
        {"token_hash": token_hash},
    )
    row = result.first()
    return str(row[0]) if row else None


# ── Migration DDL (idempotent) ─────────────────────────────────────────────

CREATE_TABLES_SQL = f"""
CREATE TABLE IF NOT EXISTS {_PASSWORD_RESET_TABLE} (
    token_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS {_PASSWORD_RESET_TABLE}_user_id_idx
    ON {_PASSWORD_RESET_TABLE} (user_id);

CREATE TABLE IF NOT EXISTS {_EMAIL_VERIFICATION_TABLE} (
    token_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS {_EMAIL_VERIFICATION_TABLE}_user_id_idx
    ON {_EMAIL_VERIFICATION_TABLE} (user_id);
"""
