"""
Integration tests for SoulAuth API endpoints.
Tests the FastAPI application with an in-memory database.
"""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

from src.database.connection import Base, get_db
from src.database.models import SoulTenant, PolicyCache
from src.main import app


TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def test_app():
    """Create test application with in-memory database."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db

    # Seed test data
    async with session_factory() as session:
        tenant = SoulTenant(
            id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
            name="Test Tenant",
            slug="test",
            tier="enterprise",
        )
        session.add(tenant)

        # Add a policy cache entry
        policy = PolicyCache(
            tenant_id=tenant.id,
            persona_id="alfred",
            policy_version="test",
            resolved_policy={
                "metadata": {"tenant": "test", "persona": "alfred", "role": "orchestrator"},
                "spec": {
                    "jit": {
                        "max_capability_ttl": 900,
                        "default_capability_ttl": 300,
                        "require_active_session": False,
                        "allowed_nodes": ["*"],
                        "operating_window": "24/7",
                        "max_concurrent_capabilities": 10,
                    },
                    "escalation": {
                        "can_grant_temporary_access": True,
                        "can_suspend_agents": True,
                        "approval_required_for": [],
                    },
                    "resources": {
                        "memory": [{
                            "actions": ["read", "write", "delete"],
                            "scopes": ["*"],
                            "nodes": ["*"],
                            "services": ["*"],
                            "conditions": [],
                        }],
                    },
                },
            },
        )
        session.add(policy)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


class TestHealthEndpoint:
    """Tests for health check."""

    @pytest.mark.asyncio
    async def test_health_check(self, test_app):
        response = await test_app.get("/health")
        # In test environment, database may not be reachable via the health
        # check's direct engine connection (it uses the production engine,
        # not the test-overridden dependency). Accept 200 or 503.
        assert response.status_code in (200, 503)
        data = response.json()
        assert data["status"] in ("healthy", "unhealthy", "degraded")
        assert data["service"] == "soulauth"

    @pytest.mark.asyncio
    async def test_health_check_simple_format(self, test_app):
        """Simple health check returns minimal fields."""
        response = await test_app.get("/health")
        data = response.json()
        assert "status" in data
        assert "service" in data
        assert "version" in data
        # Simple mode should NOT include components
        assert "components" not in data

    @pytest.mark.asyncio
    async def test_health_check_detail(self, test_app):
        """Detailed health check returns component breakdown."""
        response = await test_app.get("/health?detail=true")
        data = response.json()
        assert "status" in data
        assert "components" in data
        assert "database" in data["components"]
        assert "jwt_keys" in data["components"]
        assert "policy_sync" in data["components"]

    @pytest.mark.asyncio
    async def test_root_endpoint(self, test_app):
        response = await test_app.get("/")
        assert response.status_code == 200
        assert "SoulAuth" in response.json()["service"]


class TestAdminKeyEndpoints:
    """Tests for admin key management endpoints."""

    @pytest.mark.asyncio
    async def test_issue_soulkey(self, test_app):
        """POST /v1/soulauth/admin/keys issues a new soulkey."""
        response = await test_app.post(
            "/v1/soulauth/admin/keys",
            json={
                "tenant_id": "11111111-1111-1111-1111-111111111111",
                "persona_id": "alfred",
                "label": "Test key for Alfred",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["persona_id"] == "alfred"
        assert data["raw_key"].startswith("sk_agent_")
        assert data["status"] == "active"

    @pytest.mark.asyncio
    async def test_list_soulkeys(self, test_app):
        """GET /v1/soulauth/admin/keys lists tenant keys."""
        # Issue a key first
        await test_app.post(
            "/v1/soulauth/admin/keys",
            json={
                "tenant_id": "11111111-1111-1111-1111-111111111111",
                "persona_id": "oracle",
            },
        )

        response = await test_app.get(
            "/v1/soulauth/admin/keys",
            params={"tenant_id": "11111111-1111-1111-1111-111111111111"},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1


class TestAuthEndpoints:
    """Tests for auth evaluation endpoints."""

    @pytest.mark.asyncio
    async def test_identity_resolution(self, test_app):
        """GET /v1/auth/identity resolves soulkey to identity."""
        # Issue key
        issue_resp = await test_app.post(
            "/v1/soulauth/admin/keys",
            json={
                "tenant_id": "11111111-1111-1111-1111-111111111111",
                "persona_id": "alfred",
            },
        )
        raw_key = issue_resp.json()["raw_key"]

        # Resolve identity
        response = await test_app.get(
            "/v1/auth/identity",
            headers={"X-Soulkey": raw_key},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["persona_id"] == "alfred"
        assert data["status"] == "active"

    @pytest.mark.asyncio
    async def test_identity_invalid_key(self, test_app):
        """GET /v1/auth/identity rejects invalid soulkey."""
        response = await test_app.get(
            "/v1/auth/identity",
            headers={"X-Soulkey": "sk_agent_fake_invalid_0000"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_evaluate_grant(self, test_app):
        """POST /v1/auth/evaluate grants access for valid policy match."""
        # Issue key
        issue_resp = await test_app.post(
            "/v1/soulauth/admin/keys",
            json={
                "tenant_id": "11111111-1111-1111-1111-111111111111",
                "persona_id": "alfred",
            },
        )
        raw_key = issue_resp.json()["raw_key"]

        # Evaluate access
        response = await test_app.post(
            "/v1/auth/evaluate",
            headers={"X-Soulkey": raw_key},
            json={
                "resource": "memory",
                "action": "read",
                "scope": "cs:algorithms",
                "context": {"node": "ai-lab"},
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["decision"] == "grant"
        assert data["capability_token"] is not None
        assert data["expires_in"] > 0
        assert "memory:read:cs:algorithms" in data["granted_scopes"]

    @pytest.mark.asyncio
    async def test_evaluate_deny_no_policy(self, test_app):
        """POST /v1/auth/evaluate denies when no policy exists."""
        # Issue key for persona without policy
        issue_resp = await test_app.post(
            "/v1/soulauth/admin/keys",
            json={
                "tenant_id": "11111111-1111-1111-1111-111111111111",
                "persona_id": "no-policy-persona",
            },
        )
        raw_key = issue_resp.json()["raw_key"]

        response = await test_app.post(
            "/v1/auth/evaluate",
            headers={"X-Soulkey": raw_key},
            json={
                "resource": "memory",
                "action": "read",
                "scope": "anything",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["decision"] == "deny"
        assert "no policy" in data["reason"]

    @pytest.mark.asyncio
    async def test_whoami(self, test_app):
        """GET /v1/auth/whoami returns agent self-inspection."""
        issue_resp = await test_app.post(
            "/v1/soulauth/admin/keys",
            json={
                "tenant_id": "11111111-1111-1111-1111-111111111111",
                "persona_id": "alfred",
            },
        )
        raw_key = issue_resp.json()["raw_key"]

        response = await test_app.get(
            "/v1/auth/whoami",
            headers={"X-Soulkey": raw_key},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["persona_id"] == "alfred"
        assert data["status"] == "active"
