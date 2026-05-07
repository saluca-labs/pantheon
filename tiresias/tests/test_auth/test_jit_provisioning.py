"""
Tests for JIT user provisioning from OIDC claims.
"""
import uuid
import pytest
import pytest_asyncio
from unittest.mock import MagicMock
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import HTTPException

from src.database.connection import Base
from src.database.models import SoulTenant, SoulUser, SoulIdPConfig
from src.auth.jit_provisioning import jit_provision_user, _resolve_role_from_groups, _extract_groups_from_claims

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


@pytest.fixture
def tenant_id():
    return uuid.UUID("11111111-1111-1111-1111-111111111111")


@pytest_asyncio.fixture
async def sample_tenant(db_session, tenant_id):
    tenant = SoulTenant(id=tenant_id, name="Test", slug="test", tier="enterprise", status="active")
    db_session.add(tenant)
    await db_session.flush()
    return tenant


@pytest.fixture
def mock_idp_config(tenant_id):
    config = MagicMock(spec=SoulIdPConfig)
    config.provider_type = "google"
    config.group_role_map = {}
    config.claim_mapping = {"email": "email", "name": "name"}
    return config


class TestRoleResolution:
    def test_default_role_when_no_groups(self):
        role = _resolve_role_from_groups([], {}, "viewer")
        assert role == "viewer"

    def test_group_maps_to_role(self):
        role = _resolve_role_from_groups(["admins"], {"admins": "admin"}, "viewer")
        assert role == "admin"

    def test_highest_role_wins(self):
        role = _resolve_role_from_groups(
            ["viewers", "admins"],
            {"viewers": "viewer", "admins": "admin"},
            "viewer",
        )
        assert role == "admin"

    def test_unknown_group_ignored(self):
        role = _resolve_role_from_groups(["unknown_group"], {"admins": "admin"}, "viewer")
        assert role == "viewer"


class TestExtractGroups:
    def test_extracts_list(self):
        assert _extract_groups_from_claims({"groups": ["a", "b"]}) == ["a", "b"]

    def test_extracts_string_as_list(self):
        assert _extract_groups_from_claims({"groups": "admin"}) == ["admin"]

    def test_empty_when_no_claim(self):
        assert _extract_groups_from_claims({}) == []


class TestJITProvisioning:
    @pytest.mark.asyncio
    async def test_creates_new_user(self, db_session, sample_tenant, mock_idp_config, tenant_id):
        claims = {"sub": "google-123", "email": "alice@example.com", "name": "Alice"}
        user = await jit_provision_user(db_session, tenant_id, mock_idp_config, claims)
        assert user.email == "alice@example.com"
        assert user.idp_sub == "google-123"
        assert user.idp_provider == "google"
        assert user.status == "active"

    @pytest.mark.asyncio
    async def test_returns_existing_user(self, db_session, sample_tenant, mock_idp_config, tenant_id):
        claims = {"sub": "google-123", "email": "alice@example.com", "name": "Alice"}
        user1 = await jit_provision_user(db_session, tenant_id, mock_idp_config, claims)
        await db_session.flush()
        user2 = await jit_provision_user(db_session, tenant_id, mock_idp_config, claims)
        assert user1.id == user2.id

    @pytest.mark.asyncio
    async def test_raises_403_for_suspended_user(self, db_session, sample_tenant, mock_idp_config, tenant_id):
        # Pre-create suspended user
        user = SoulUser(
            tenant_id=tenant_id, email="bob@example.com",
            admin_role="viewer", idp_sub="google-bob",
            idp_provider="google", status="suspended",
        )
        db_session.add(user)
        await db_session.flush()

        claims = {"sub": "google-bob", "email": "bob@example.com", "name": "Bob"}
        with pytest.raises(HTTPException) as exc_info:
            await jit_provision_user(db_session, tenant_id, mock_idp_config, claims)
        assert exc_info.value.status_code == 403
