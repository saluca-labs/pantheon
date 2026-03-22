"""
Tests for OIDC session create, validate, revoke.
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

from src.database.connection import Base
from src.database.models import SoulTenant, SoulUser, SoulOIDCSession
from src.auth.oidc_session import create_session, validate_session, revoke_session, _hash_token

import os
os.environ.setdefault("SOULAUTH_MODE", "local")
os.environ.setdefault("SOULAUTH_TESTING", "true")
os.environ.setdefault("SOULAUTH_DEBUG", "true")

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sf = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with sf() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def sample_user(db_session):
    tenant = SoulTenant(id=uuid.UUID("11111111-1111-1111-1111-111111111111"), name="T", slug="t", tier="enterprise", status="active")
    db_session.add(tenant)
    user = SoulUser(id=uuid.uuid4(), tenant_id=tenant.id, email="alice@example.com", admin_role="admin", status="active")
    db_session.add(user)
    await db_session.flush()
    return user


class TestCreateSession:
    @pytest.mark.asyncio
    async def test_creates_session_returns_raw_token(self, db_session, sample_user):
        raw_token, session = await create_session(db_session, sample_user)
        assert raw_token
        assert session.id is not None
        assert session.session_token == _hash_token(raw_token)
        assert session.user_id == sample_user.id

    @pytest.mark.asyncio
    async def test_session_token_is_hashed_not_plaintext(self, db_session, sample_user):
        raw_token, session = await create_session(db_session, sample_user)
        assert session.session_token != raw_token


class TestValidateSession:
    @pytest.mark.asyncio
    async def test_valid_session_returns_user(self, db_session, sample_user):
        raw_token, _s = await create_session(db_session, sample_user)
        result = await validate_session(db_session, raw_token)
        assert result is not None
        _session, user = result
        assert user.email == "alice@example.com"

    @pytest.mark.asyncio
    async def test_invalid_token_returns_none(self, db_session, sample_user):
        result = await validate_session(db_session, "bogus_token_xyz")
        assert result is None

    @pytest.mark.asyncio
    async def test_revoked_session_returns_none(self, db_session, sample_user):
        raw_token, _s = await create_session(db_session, sample_user)
        await revoke_session(db_session, raw_token)
        result = await validate_session(db_session, raw_token)
        assert result is None


class TestRevokeSession:
    @pytest.mark.asyncio
    async def test_revoke_returns_true(self, db_session, sample_user):
        raw_token, _s = await create_session(db_session, sample_user)
        result = await revoke_session(db_session, raw_token)
        assert result is True

    @pytest.mark.asyncio
    async def test_revoke_nonexistent_returns_false(self, db_session):
        result = await revoke_session(db_session, "nonexistent_token")
        assert result is False
