"""Tests for password-reset and email-verification token utilities.

Uses an in-memory SQLite database. The token tables are created with a
SQLite-compatible DDL so we can exercise the public API end-to-end. The
production DDL (in tokens.py) is Postgres-flavoured; we re-create only the
columns under test here.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from platform_auth.tokens import (
    PASSWORD_RESET_TTL_MINUTES,
    EMAIL_VERIFICATION_TTL_HOURS,
    consume_email_verification_token,
    consume_password_reset_token,
    issue_email_verification_token,
    issue_password_reset_token,
)


SQLITE_SCHEMA = """
CREATE TABLE _platform_password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE _platform_email_verification_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


@pytest.fixture
async def conn():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as c:
        for stmt in filter(None, (s.strip() for s in SQLITE_SCHEMA.split(";"))):
            await c.execute(text(stmt))
    async with engine.begin() as c:
        yield c
    await engine.dispose()


# ── Password reset ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_password_reset_round_trip(conn):
    user_id = str(uuid.uuid4())
    token = await issue_password_reset_token(user_id, conn)
    assert isinstance(token, str)
    assert len(token) >= 30
    consumed = await consume_password_reset_token(token, conn)
    assert consumed == user_id


@pytest.mark.asyncio
async def test_password_reset_single_use(conn):
    user_id = str(uuid.uuid4())
    token = await issue_password_reset_token(user_id, conn)
    first = await consume_password_reset_token(token, conn)
    second = await consume_password_reset_token(token, conn)
    assert first == user_id
    assert second is None


@pytest.mark.asyncio
async def test_password_reset_unknown_token_returns_none(conn):
    consumed = await consume_password_reset_token("not-a-real-token", conn)
    assert consumed is None


@pytest.mark.asyncio
async def test_password_reset_expired(conn):
    """A token with expires_at in the past must not consume."""
    user_id = str(uuid.uuid4())
    token = await issue_password_reset_token(user_id, conn, ttl_minutes=-1)
    consumed = await consume_password_reset_token(token, conn)
    assert consumed is None


# ── Email verification ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_email_verification_round_trip(conn):
    user_id = str(uuid.uuid4())
    token = await issue_email_verification_token(user_id, conn)
    consumed = await consume_email_verification_token(token, conn)
    assert consumed == user_id


@pytest.mark.asyncio
async def test_email_verification_single_use(conn):
    user_id = str(uuid.uuid4())
    token = await issue_email_verification_token(user_id, conn)
    first = await consume_email_verification_token(token, conn)
    second = await consume_email_verification_token(token, conn)
    assert first == user_id
    assert second is None


@pytest.mark.asyncio
async def test_email_verification_expired(conn):
    user_id = str(uuid.uuid4())
    token = await issue_email_verification_token(user_id, conn, ttl_hours=-1)
    consumed = await consume_email_verification_token(token, conn)
    assert consumed is None


@pytest.mark.asyncio
async def test_token_is_hashed_in_storage(conn):
    """The plaintext token must not be persisted directly."""
    user_id = str(uuid.uuid4())
    token = await issue_password_reset_token(user_id, conn)
    rows = (await conn.execute(
        text("SELECT token_hash FROM _platform_password_reset_tokens")
    )).all()
    stored = [r[0] for r in rows]
    assert token not in stored
    # Hashes are 64 hex chars (sha256)
    assert all(len(h) == 64 for h in stored)
