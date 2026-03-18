"""
End-to-end tests for complete SoulAuth workflows.
Tests the full lifecycle: tenant -> key -> policy -> evaluate -> token.
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

TENANT_ID = "11111111-1111-1111-1111-111111111111"


@pytest_asyncio.fixture
async def e2e_app():
    """Create E2E test application with seeded data."""
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

    # Seed tenant
    async with session_factory() as session:
        tenant = SoulTenant(
            id=uuid.UUID(TENANT_ID),
            name="E2E Test Tenant",
            slug="e2e-test",
            tier="enterprise",
        )
        session.add(tenant)

        # Add policy for alfred
        policy = PolicyCache(
            tenant_id=tenant.id,
            persona_id="alfred",
            policy_version="e2e",
            resolved_policy={
                "metadata": {"tenant": "e2e-test", "persona": "alfred", "role": "orchestrator"},
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
                        "vault": [{
                            "actions": ["read"],
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


class TestFullAuthFlow:
    """E2E: Full authentication and authorization lifecycle."""

    @pytest.mark.asyncio
    async def test_complete_auth_lifecycle(self, e2e_app):
        """
        Complete flow:
        1. Issue soulkey
        2. Resolve identity
        3. Evaluate access -> GRANT
        4. Use capability token (whoami)
        5. Suspend key
        6. Evaluate access -> DENY
        7. Reinstate key
        8. Evaluate access -> GRANT again
        """
        # 1. Issue soulkey
        issue_resp = await e2e_app.post(
            "/v1/soulauth/admin/keys",
            json={"tenant_id": TENANT_ID, "persona_id": "alfred"},
        )
        assert issue_resp.status_code == 200
        raw_key = issue_resp.json()["raw_key"]
        key_id = issue_resp.json()["soulkey_id"]

        # 2. Resolve identity
        id_resp = await e2e_app.get(
            "/v1/auth/identity", headers={"X-Soulkey": raw_key}
        )
        assert id_resp.status_code == 200
        assert id_resp.json()["persona_id"] == "alfred"

        # 3. Evaluate access -> GRANT
        eval_resp = await e2e_app.post(
            "/v1/auth/evaluate",
            headers={"X-Soulkey": raw_key},
            json={"resource": "memory", "action": "read", "scope": "cs:algorithms"},
        )
        assert eval_resp.status_code == 200
        assert eval_resp.json()["decision"] == "grant"
        assert eval_resp.json()["capability_token"] is not None

        # 4. Whoami
        whoami_resp = await e2e_app.get(
            "/v1/auth/whoami", headers={"X-Soulkey": raw_key}
        )
        assert whoami_resp.status_code == 200
        assert whoami_resp.json()["persona_id"] == "alfred"

        # 5. Suspend key
        suspend_resp = await e2e_app.post(
            f"/v1/soulauth/admin/keys/{key_id}/suspend",
            json={"suspended_by": "admin", "reason": "E2E test"},
        )
        assert suspend_resp.status_code == 200

        # 6. Evaluate access -> DENY (suspended)
        eval_deny = await e2e_app.post(
            "/v1/auth/evaluate",
            headers={"X-Soulkey": raw_key},
            json={"resource": "memory", "action": "read", "scope": "cs:algorithms"},
        )
        assert eval_deny.status_code == 200
        assert eval_deny.json()["decision"] == "deny"
        assert "suspended" in eval_deny.json()["reason"]

        # 7. Reinstate key
        reinstate_resp = await e2e_app.post(
            f"/v1/soulauth/admin/keys/{key_id}/reinstate"
        )
        assert reinstate_resp.status_code == 200

        # 8. Evaluate access -> GRANT again
        eval_grant2 = await e2e_app.post(
            "/v1/auth/evaluate",
            headers={"X-Soulkey": raw_key},
            json={"resource": "memory", "action": "write", "scope": "cs:new-topic"},
        )
        assert eval_grant2.status_code == 200
        assert eval_grant2.json()["decision"] == "grant"

    @pytest.mark.asyncio
    async def test_key_rotation_flow(self, e2e_app):
        """E2E: Key rotation — old key stops working, new key works."""
        # Issue key
        issue_resp = await e2e_app.post(
            "/v1/soulauth/admin/keys",
            json={"tenant_id": TENANT_ID, "persona_id": "alfred"},
        )
        old_key = issue_resp.json()["raw_key"]
        old_id = issue_resp.json()["soulkey_id"]

        # Rotate
        rotate_resp = await e2e_app.post(
            f"/v1/soulauth/admin/keys/{old_id}/rotate"
        )
        assert rotate_resp.status_code == 200
        new_key = rotate_resp.json()["raw_key"]
        assert new_key != old_key

        # Old key should fail
        old_id_resp = await e2e_app.get(
            "/v1/auth/identity", headers={"X-Soulkey": old_key}
        )
        # The key still resolves but status is revoked
        if old_id_resp.status_code == 200:
            assert old_id_resp.json()["status"] == "revoked"

        # New key should work
        new_id_resp = await e2e_app.get(
            "/v1/auth/identity", headers={"X-Soulkey": new_key}
        )
        assert new_id_resp.status_code == 200
        assert new_id_resp.json()["status"] == "active"


class TestTenantManagementFlow:
    """E2E: Tenant management operations."""

    @pytest.mark.asyncio
    async def test_tenant_crud(self, e2e_app):
        """Create, read, update, list tenants."""
        # Create
        create_resp = await e2e_app.post(
            "/v1/soulauth/admin/tenants",
            json={"name": "New Corp", "slug": "new-corp", "tier": "professional"},
        )
        assert create_resp.status_code == 200
        tenant_id = create_resp.json()["id"]
        assert create_resp.json()["tier"] == "professional"

        # Read
        get_resp = await e2e_app.get(f"/v1/soulauth/admin/tenants/{tenant_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["name"] == "New Corp"

        # Update
        patch_resp = await e2e_app.patch(
            f"/v1/soulauth/admin/tenants/{tenant_id}",
            json={"tier": "enterprise"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["tier"] == "enterprise"

        # List
        list_resp = await e2e_app.get("/v1/soulauth/admin/tenants")
        assert list_resp.status_code == 200
        slugs = [t["slug"] for t in list_resp.json()]
        assert "new-corp" in slugs

    @pytest.mark.asyncio
    async def test_tenant_suspension(self, e2e_app):
        """Suspend and reactivate a tenant."""
        create_resp = await e2e_app.post(
            "/v1/soulauth/admin/tenants",
            json={"name": "Suspend Corp", "slug": "suspend-corp"},
        )
        tenant_id = create_resp.json()["id"]

        # Suspend
        suspend_resp = await e2e_app.post(
            f"/v1/soulauth/admin/tenants/{tenant_id}/suspend"
        )
        assert suspend_resp.status_code == 200
        assert suspend_resp.json()["status"] == "suspended"

        # Activate
        activate_resp = await e2e_app.post(
            f"/v1/soulauth/admin/tenants/{tenant_id}/activate"
        )
        assert activate_resp.status_code == 200
        assert activate_resp.json()["status"] == "active"

    @pytest.mark.asyncio
    async def test_duplicate_tenant_slug_rejected(self, e2e_app):
        """Duplicate tenant slug returns 409."""
        await e2e_app.post(
            "/v1/soulauth/admin/tenants",
            json={"name": "First", "slug": "unique-slug-test"},
        )

        dup_resp = await e2e_app.post(
            "/v1/soulauth/admin/tenants",
            json={"name": "Second", "slug": "unique-slug-test"},
        )
        assert dup_resp.status_code == 409


class TestAuditFlow:
    """E2E: Audit trail verification."""

    @pytest.mark.asyncio
    async def test_audit_captures_auth_events(self, e2e_app):
        """Auth events appear in audit log."""
        # Issue and evaluate
        issue_resp = await e2e_app.post(
            "/v1/soulauth/admin/keys",
            json={"tenant_id": TENANT_ID, "persona_id": "alfred"},
        )
        raw_key = issue_resp.json()["raw_key"]

        await e2e_app.post(
            "/v1/auth/evaluate",
            headers={"X-Soulkey": raw_key},
            json={"resource": "memory", "action": "read", "scope": "test"},
        )

        # Check audit
        audit_resp = await e2e_app.get(
            "/v1/soulauth/admin/audit/report",
            params={"tenant_id": TENANT_ID},
        )
        assert audit_resp.status_code == 200
        events = audit_resp.json()["events"]
        assert len(events) > 0
        event_types = [e["event_type"] for e in events]
        assert "key_issued" in event_types
        assert "auth_grant" in event_types
