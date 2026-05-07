"""
Tests for notification channel CRUD router (/v1/notifications/channels).
Validates DB persistence, encryption, listing, update, delete, and test endpoints.
"""
import json
import os
import uuid
from unittest.mock import patch, MagicMock

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Set Fernet key BEFORE importing app (settings are cached)
os.environ.setdefault("SOULAUTH_OIDC_SECRET_KEY", "kZmZija6XacRC8eURqBK5AYjjaX9txqiwXRrEIHqnnc=")

from src.database.connection import Base, get_db
from src.database.models import SoulTenant
from src.main import app


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
    await engine.dispose()


@pytest_asyncio.fixture
async def tenant_id(db_session):
    """Create a test tenant and return its ID."""
    tid = uuid.uuid4()
    async with db_session() as session:
        tenant = SoulTenant(id=tid, name="Test Tenant", slug="test", tier="enterprise")
        session.add(tenant)
        await session.commit()
    return tid


@pytest_asyncio.fixture
async def client(db_session, tenant_id):
    """Test client with X-Tenant-ID header."""
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"X-Tenant-ID": str(tenant_id)},
    ) as client:
        yield client


@pytest.mark.asyncio
async def test_list_channels_empty(client):
    """Empty DB returns empty list."""
    resp = await client.get("/v1/notifications/channels")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_slack_channel(client):
    """Create a Slack notification channel."""
    resp = await client.post("/v1/notifications/channels", json={
        "name": "prod-slack",
        "channel_type": "slack",
        "config": {"webhook_url": "https://hooks.slack.com/services/T00/B00/xxxx"},
        "severity_threshold": "high",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "prod-slack"
    assert data["channel_type"] == "slack"
    assert data["severity_threshold"] == "high"
    assert data["enabled"] is True
    # Webhook URL should be masked
    assert "****" in data["config"]["webhook_url"]


@pytest.mark.asyncio
async def test_create_pagerduty_channel(client):
    """Create a PagerDuty notification channel."""
    resp = await client.post("/v1/notifications/channels", json={
        "name": "oncall-pd",
        "channel_type": "pagerduty",
        "config": {"routing_key": "pd_routing_key_1234567890abcdef"},
    })
    assert resp.status_code == 201
    assert resp.json()["channel_type"] == "pagerduty"


@pytest.mark.asyncio
async def test_create_invalid_channel_type(client):
    """Invalid channel type returns 400."""
    resp = await client.post("/v1/notifications/channels", json={
        "name": "bad",
        "channel_type": "fax_machine",
        "config": {},
    })
    assert resp.status_code == 400
    assert "Invalid channel_type" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_create_invalid_severity(client):
    """Invalid severity threshold returns 400."""
    resp = await client.post("/v1/notifications/channels", json={
        "name": "bad",
        "channel_type": "slack",
        "config": {"webhook_url": "https://hooks.slack.com/x"},
        "severity_threshold": "apocalyptic",
    })
    assert resp.status_code == 400
    assert "severity_threshold" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_list_channels(client):
    """Create multiple channels and list them."""
    for name in ["slack-1", "pd-1", "email-1"]:
        ctype = "slack" if "slack" in name else "pagerduty" if "pd" in name else "email"
        await client.post("/v1/notifications/channels", json={
            "name": name,
            "channel_type": ctype,
            "config": {"webhook_url": "https://example.com"} if ctype != "email" else {"smtp_host": "smtp.test"},
        })

    resp = await client.get("/v1/notifications/channels")
    assert resp.status_code == 200
    assert len(resp.json()) == 3


@pytest.mark.asyncio
async def test_get_channel(client):
    """Get a single channel by ID."""
    create = await client.post("/v1/notifications/channels", json={
        "name": "get-test",
        "channel_type": "webhook",
        "config": {"url": "https://example.com/alerts"},
    })
    cid = create.json()["id"]

    resp = await client.get(f"/v1/notifications/channels/{cid}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "get-test"


@pytest.mark.asyncio
async def test_get_channel_not_found(client):
    """Get nonexistent channel returns 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"/v1/notifications/channels/{fake_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_channel(client):
    """Update channel name, severity, and enabled status."""
    create = await client.post("/v1/notifications/channels", json={
        "name": "update-test",
        "channel_type": "slack",
        "config": {"webhook_url": "https://hooks.slack.com/old"},
    })
    cid = create.json()["id"]

    resp = await client.put(f"/v1/notifications/channels/{cid}", json={
        "name": "updated-channel",
        "severity_threshold": "critical",
        "enabled": False,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "updated-channel"
    assert data["severity_threshold"] == "critical"
    assert data["enabled"] is False


@pytest.mark.asyncio
async def test_update_channel_config(client):
    """Update channel config re-encrypts."""
    create = await client.post("/v1/notifications/channels", json={
        "name": "reconfig-test",
        "channel_type": "slack",
        "config": {"webhook_url": "https://hooks.slack.com/old-url-1234"},
    })
    cid = create.json()["id"]

    resp = await client.put(f"/v1/notifications/channels/{cid}", json={
        "config": {"webhook_url": "https://hooks.slack.com/new-url-5678"},
    })
    assert resp.status_code == 200
    # Masked but different from original
    assert "****" in resp.json()["config"]["webhook_url"]


@pytest.mark.asyncio
async def test_update_invalid_severity(client):
    """Update with invalid severity returns 400."""
    create = await client.post("/v1/notifications/channels", json={
        "name": "sev-test",
        "channel_type": "slack",
        "config": {"webhook_url": "https://hooks.slack.com/x"},
    })
    cid = create.json()["id"]

    resp = await client.put(f"/v1/notifications/channels/{cid}", json={
        "severity_threshold": "nuclear",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_update_not_found(client):
    """Update nonexistent channel returns 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.put(f"/v1/notifications/channels/{fake_id}", json={"name": "x"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_channel(client):
    """Delete a channel and verify it's gone."""
    create = await client.post("/v1/notifications/channels", json={
        "name": "delete-test",
        "channel_type": "teams",
        "config": {"webhook_url": "https://teams.webhook.office.com/xxx"},
    })
    cid = create.json()["id"]

    resp = await client.delete(f"/v1/notifications/channels/{cid}")
    assert resp.status_code == 204

    resp = await client.get(f"/v1/notifications/channels/{cid}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_not_found(client):
    """Delete nonexistent channel returns 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.delete(f"/v1/notifications/channels/{fake_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_test_channel_email_validates_config(client):
    """Test email channel validates SMTP config fields."""
    create = await client.post("/v1/notifications/channels", json={
        "name": "test-email",
        "channel_type": "email",
        "config": {
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "from_address": "alerts@example.com",
            "to_addresses": "team@example.com",
        },
    })
    cid = create.json()["id"]

    resp = await client.post(f"/v1/notifications/channels/{cid}/test", json={})
    assert resp.status_code == 200
    assert resp.json()["test_status"] == "passed"


@pytest.mark.asyncio
async def test_test_channel_email_missing_fields(client):
    """Test email channel with incomplete SMTP config fails validation."""
    create = await client.post("/v1/notifications/channels", json={
        "name": "bad-email",
        "channel_type": "email",
        "config": {"smtp_host": "smtp.example.com"},  # missing port, from, to
    })
    cid = create.json()["id"]

    resp = await client.post(f"/v1/notifications/channels/{cid}/test", json={})
    assert resp.status_code == 200
    assert resp.json()["test_status"] == "failed"


@pytest.mark.asyncio
async def test_test_channel_not_found(client):
    """Test nonexistent channel returns 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.post(f"/v1/notifications/channels/{fake_id}/test", json={})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation(db_session):
    """Channels from one tenant are not visible to another."""
    # Create two tenants
    t1 = uuid.uuid4()
    t2 = uuid.uuid4()
    async with db_session() as session:
        session.add(SoulTenant(id=t1, name="T1", slug="t1", tier="enterprise"))
        session.add(SoulTenant(id=t2, name="T2", slug="t2", tier="enterprise"))
        await session.commit()

    transport = ASGITransport(app=app)

    # Tenant 1 creates a channel
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-Tenant-ID": str(t1)}) as c1:
        resp = await c1.post("/v1/notifications/channels", json={
            "name": "t1-slack",
            "channel_type": "slack",
            "config": {"webhook_url": "https://hooks.slack.com/t1"},
        })
        assert resp.status_code == 201

    # Tenant 2 should see no channels
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-Tenant-ID": str(t2)}) as c2:
        resp = await c2.get("/v1/notifications/channels")
        assert resp.status_code == 200
        assert len(resp.json()) == 0


import asyncio
