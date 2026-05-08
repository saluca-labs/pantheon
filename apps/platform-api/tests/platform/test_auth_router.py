"""Tests for the platform v2 auth follow-up router.

Uses a fresh FastAPI app and an in-memory SQLite DB. We mount only the
platform_auth_router and override the legacy DB dependency so we don't
pull in the full platform-api stack.
"""

from __future__ import annotations

import uuid
from typing import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Make sure src.* imports work
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(API_ROOT))

from src.platform.auth_router import router as auth_router, _get_db  # noqa: E402


SQLITE_SCHEMA = """
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT,
    email_verified INTEGER DEFAULT 0
);
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
CREATE TABLE _platform_jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
);
"""


@pytest.fixture
async def session_factory():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        for stmt in filter(None, (s.strip() for s in SQLITE_SCHEMA.split(";"))):
            await conn.execute(text(stmt))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest.fixture
async def app_and_client(session_factory):
    app = FastAPI()
    app.include_router(auth_router)

    # Patch the JSONB cast used by _enqueue_job so SQLite accepts it.
    # The router uses `CAST(:payload AS JSONB)` which SQLite parses as
    # CAST(... AS JSONB) — JSONB is unknown but SQLite tolerates it as
    # a no-op type affinity, so we don't actually need to patch anything.

    async def _override_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[_get_db] = _override_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield app, client, session_factory


# ── /v1/auth/mode ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_auth_mode_default(app_and_client, monkeypatch):
    monkeypatch.delenv("AUTH_MODE", raising=False)
    _, client, _ = app_and_client
    res = await client.get("/v1/auth/mode")
    assert res.status_code == 200
    body = res.json()
    assert body["mode"] == "local"
    assert body["oidc_enabled"] is False


@pytest.mark.asyncio
async def test_auth_mode_oidc(app_and_client, monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "oidc")
    _, client, _ = app_and_client
    res = await client.get("/v1/auth/mode")
    body = res.json()
    assert body["mode"] == "oidc"
    assert body["oidc_enabled"] is True


# ── Password reset ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_reset_request_unknown_email_returns_202(app_and_client):
    _, client, _ = app_and_client
    res = await client.post(
        "/v1/auth/password/reset/request",
        json={"email": "ghost@example.com"},
    )
    assert res.status_code == 202
    assert res.json() == {"status": "accepted", "detail": None}


@pytest.mark.asyncio
async def test_reset_round_trip(app_and_client):
    _, client, factory = app_and_client
    user_id = str(uuid.uuid4())
    async with factory() as s:
        await s.execute(
            text("INSERT INTO users (id, email, password_hash) VALUES (:id, :e, :p)"),
            {"id": user_id, "e": "real@example.com", "p": "old-hash"},
        )
        await s.commit()

    # Issue
    res = await client.post(
        "/v1/auth/password/reset/request", json={"email": "real@example.com"}
    )
    assert res.status_code == 202

    # Pull the token from the DB
    async with factory() as s:
        row = (await s.execute(
            text("SELECT token_hash FROM _platform_password_reset_tokens")
        )).first()
        assert row is not None
        # We can't recover the plain token from the DB; instead, exercise
        # the consume path with an issued token via a second issue+capture.

    # Re-issue, this time intercept the token by patching tokens module
    # — simulate via a second call and read the worker job payload.
    async with factory() as s:
        row = (await s.execute(
            text("SELECT payload FROM _platform_jobs WHERE kind='email.password_reset'")
        )).first()
        assert row is not None
        import json
        payload = json.loads(row[0])
        token = payload["token"]

    # Confirm
    res = await client.post(
        "/v1/auth/password/reset/confirm",
        json={"token": token, "new_password": "new-strong-password-1234"},
    )
    assert res.status_code == 200, res.text
    assert res.json() == {"status": "ok", "detail": None}

    # Confirm second use fails
    res = await client.post(
        "/v1/auth/password/reset/confirm",
        json={"token": token, "new_password": "another-strong-password-12"},
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_reset_confirm_invalid_token(app_and_client):
    _, client, _ = app_and_client
    res = await client.post(
        "/v1/auth/password/reset/confirm",
        json={"token": "x" * 40, "new_password": "new-strong-password-1234"},
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_reset_confirm_short_password_rejected(app_and_client):
    _, client, _ = app_and_client
    res = await client.post(
        "/v1/auth/password/reset/confirm",
        json={"token": "x" * 40, "new_password": "short"},
    )
    assert res.status_code == 422


# ── Email verification ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_verify_request_unknown_email_returns_202(app_and_client):
    _, client, _ = app_and_client
    res = await client.post(
        "/v1/auth/email/verification/request",
        json={"email": "ghost@example.com"},
    )
    assert res.status_code == 202


@pytest.mark.asyncio
async def test_verify_round_trip_marks_user_verified(app_and_client):
    _, client, factory = app_and_client
    user_id = str(uuid.uuid4())
    async with factory() as s:
        await s.execute(
            text(
                "INSERT INTO users (id, email, password_hash, email_verified) "
                "VALUES (:id, :e, :p, 0)"
            ),
            {"id": user_id, "e": "verify@example.com", "p": "h"},
        )
        await s.commit()

    res = await client.post(
        "/v1/auth/email/verification/request",
        json={"email": "verify@example.com"},
    )
    assert res.status_code == 202

    async with factory() as s:
        import json
        row = (await s.execute(
            text("SELECT payload FROM _platform_jobs WHERE kind='email.verification'")
        )).first()
        token = json.loads(row[0])["token"]

    res = await client.post(
        "/v1/auth/email/verification/confirm",
        json={"token": token},
    )
    assert res.status_code == 200

    async with factory() as s:
        verified = (await s.execute(
            text("SELECT email_verified FROM users WHERE id = :id"),
            {"id": user_id},
        )).scalar_one()
    assert verified == 1
