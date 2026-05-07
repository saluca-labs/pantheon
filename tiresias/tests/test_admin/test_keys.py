"""
Tests for admin key management endpoints.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.database.connection import Base, get_db
from src.database.models import SoulTenant, Soulkey
from src.main import app


@pytest_asyncio.fixture
async def db_session():
    """Create an in-memory database for testing."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with async_session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db

    yield async_session

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session):
    """Create a test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_issue_soulkey(client, db_session):
    """Test issuing a new soulkey."""
    tenant = SoulTenant(
        id=uuid.uuid4(),
        name="Test Tenant",
        slug="test",
        tier="enterprise",
    )
    async with db_session() as session:
        session.add(tenant)
        await session.commit()

    response = await client.post(
        "/v1/soulauth/admin/keys",
        json={
            "tenant_id": str(tenant.id),
            "persona_id": "alfred",
            "label": "Test key",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["persona_id"] == "alfred"
    assert data["raw_key"].startswith("sk_agent_")
    assert data["status"] == "active"

    # Check that the key was stored in the database
    async with db_session() as session:
        result = await session.execute(
            select(Soulkey).where(Soulkey.id == uuid.UUID(data["soulkey_id"]))
        )
        key = result.scalar_one()
        assert key.persona_id == "alfred"
        assert key.label == "Test key"
        assert key.status == "active"


@pytest.mark.asyncio
async def test_list_soulkeys(client, db_session):
    """Test listing soulkeys for a tenant."""
    tenant = SoulTenant(
        id=uuid.uuid4(),
        name="Test Tenant",
        slug="test",
        tier="enterprise",
    )
    async with db_session() as session:
        session.add(tenant)
        await session.commit()

        # Issue two keys via API
        response1 = await client.post(
            "/v1/soulauth/admin/keys",
            json={
                "tenant_id": str(tenant.id),
                "persona_id": "alfred",
                "label": "First key",
            },
        )
        assert response1.status_code == 200
        key1 = response1.json()

        response2 = await client.post(
            "/v1/soulauth/admin/keys",
            json={
                "tenant_id": str(tenant.id),
                "persona_id": "oracle",
                "label": "Second key",
            },
        )
        assert response2.status_code == 200
        key2 = response2.json()

    response = await client.get(
        "/v1/soulauth/admin/keys",
        params={"tenant_id": str(tenant.id)},
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 2

    # Check that both keys are in the list
    persona_ids = [k["persona_id"] for k in data]
    assert "alfred" in persona_ids
    assert "oracle" in persona_ids


@pytest.mark.asyncio
async def test_suspend_and_reinstate_key(client, db_session):
    """Test suspending and reinstating a soulkey."""
    tenant = SoulTenant(
        id=uuid.uuid4(),
        name="Test Tenant",
        slug="test",
        tier="enterprise",
    )
    async with db_session() as session:
        session.add(tenant)
        await session.commit()

        # Issue a key via API
        response = await client.post(
            "/v1/soulauth/admin/keys",
            json={
                "tenant_id": str(tenant.id),
                "persona_id": "alfred",
                "label": "Test key",
            },
        )
        assert response.status_code == 200
        key_data = response.json()
        key_id = key_data["soulkey_id"]
        await session.commit()

    # Suspend the key
    response = await client.post(
        f"/v1/soulauth/admin/keys/{key_id}/suspend",
        json={"suspended_by": "admin", "reason": "test"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "suspended"

    # Reinstate the key
    response = await client.post(
        f"/v1/soulauth/admin/keys/{key_id}/reinstate",
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "active"


@pytest.mark.asyncio
async def test_revoke_key(client, db_session):
    """Test revoking a soulkey."""
    tenant = SoulTenant(
        id=uuid.uuid4(),
        name="Test Tenant",
        slug="test",
        tier="enterprise",
    )
    async with db_session() as session:
        session.add(tenant)
        await session.commit()

        # Issue a key via API
        response = await client.post(
            "/v1/soulauth/admin/keys",
            json={
                "tenant_id": str(tenant.id),
                "persona_id": "alfred",
                "label": "Test key",
            },
        )
        assert response.status_code == 200
        key_data = response.json()
        key_id = key_data["soulkey_id"]
        await session.commit()

    # Revoke the key
    response = await client.post(
        f"/v1/soulauth/admin/keys/{key_id}/revoke",
        json={"revoked_by": "admin", "reason": "test"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "revoked"

    # Try to revive it (should fail)
    response = await client.post(
        f"/v1/soulauth/admin/keys/{key_id}/reinstate",
    )
    assert response.status_code == 404  # Not found or already revoked