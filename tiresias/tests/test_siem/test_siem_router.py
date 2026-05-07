"""
Tests for SIEM connector CRUD router (/v1/siem/connectors).
Validates DB persistence, listing, update, delete, and health endpoints.
"""
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.database.connection import Base, get_db
from src.database.models import SoulTenant
from src.main import app
from src.siem._state import reset_siem


@pytest_asyncio.fixture
async def db_session():
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
    reset_siem()
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_list_connectors_empty(client):
    """Empty DB returns empty list."""
    resp = await client.get("/v1/siem/connectors")
    assert resp.status_code == 200
    data = resp.json()
    assert data["connectors"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_create_syslog_connector(client):
    """Create a syslog connector and verify it persists."""
    resp = await client.post("/v1/siem/connectors", json={
        "kind": "syslog",
        "name": "test-syslog",
        "syslog_host": "syslog.example.com",
        "syslog_port": 514,
        "syslog_protocol": "udp",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "test-syslog"
    assert data["kind"] == "syslog"
    assert data["enabled"] is True
    connector_id = data["id"]

    # Verify it shows up in list
    resp = await client.get("/v1/siem/connectors")
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["connectors"][0]["id"] == connector_id


@pytest.mark.asyncio
async def test_create_webhook_connector(client):
    """Create a webhook connector."""
    resp = await client.post("/v1/siem/connectors", json={
        "kind": "webhook",
        "name": "test-webhook",
        "webhook_url": "https://siem.example.com/events",
        "webhook_max_retries": 5,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["kind"] == "webhook"
    assert data["name"] == "test-webhook"


@pytest.mark.asyncio
async def test_create_syslog_missing_host(client):
    """Syslog connector without host returns 400."""
    resp = await client.post("/v1/siem/connectors", json={
        "kind": "syslog",
        "name": "bad-syslog",
    })
    assert resp.status_code == 400
    assert "syslog_host" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_create_webhook_missing_url(client):
    """Webhook connector without URL returns 400."""
    resp = await client.post("/v1/siem/connectors", json={
        "kind": "webhook",
        "name": "bad-webhook",
    })
    assert resp.status_code == 400
    assert "webhook_url" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_get_connector(client):
    """Get a single connector by ID."""
    create = await client.post("/v1/siem/connectors", json={
        "kind": "syslog",
        "name": "get-test",
        "syslog_host": "syslog.test",
    })
    cid = create.json()["id"]

    resp = await client.get(f"/v1/siem/connectors/{cid}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "get-test"


@pytest.mark.asyncio
async def test_get_connector_not_found(client):
    """Get nonexistent connector returns 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"/v1/siem/connectors/{fake_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_connector(client):
    """Update connector name and enabled status."""
    create = await client.post("/v1/siem/connectors", json={
        "kind": "syslog",
        "name": "update-test",
        "syslog_host": "syslog.test",
    })
    cid = create.json()["id"]

    resp = await client.put(f"/v1/siem/connectors/{cid}", json={
        "name": "updated-name",
        "enabled": False,
    })
    assert resp.status_code == 200
    assert resp.json()["name"] == "updated-name"
    assert resp.json()["enabled"] is False


@pytest.mark.asyncio
async def test_update_connector_not_found(client):
    """Update nonexistent connector returns 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.put(f"/v1/siem/connectors/{fake_id}", json={"name": "x"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_connector(client):
    """Delete a connector and verify it's gone."""
    create = await client.post("/v1/siem/connectors", json={
        "kind": "webhook",
        "name": "delete-test",
        "webhook_url": "https://example.com/events",
    })
    cid = create.json()["id"]

    resp = await client.delete(f"/v1/siem/connectors/{cid}")
    assert resp.status_code == 204

    # Verify it's gone
    resp = await client.get(f"/v1/siem/connectors/{cid}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_connector_not_found(client):
    """Delete nonexistent connector returns 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.delete(f"/v1/siem/connectors/{fake_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_health_empty(client):
    """Health endpoint with no connectors returns zeros."""
    resp = await client.get("/v1/siem/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["healthy"] == 0


@pytest.mark.asyncio
async def test_create_with_filters(client):
    """Create connector with severity and event kind filters."""
    resp = await client.post("/v1/siem/connectors", json={
        "kind": "webhook",
        "name": "filtered",
        "webhook_url": "https://example.com/events",
        "filter_severity": ["high", "critical"],
        "filter_event_kind": ["sigma_match"],
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["filter_severity"] == ["high", "critical"]
    assert data["filter_event_kind"] == ["sigma_match"]


@pytest.mark.asyncio
async def test_multiple_connectors(client):
    """Create multiple connectors and list them all."""
    for i in range(3):
        await client.post("/v1/siem/connectors", json={
            "kind": "syslog",
            "name": f"syslog-{i}",
            "syslog_host": f"syslog-{i}.test",
        })

    resp = await client.get("/v1/siem/connectors")
    assert resp.status_code == 200
    assert resp.json()["total"] == 3
