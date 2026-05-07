"""
Tests for partner tier constraint enforcement (Build 02).

Covers:
- tier_constants.py: validation helpers, constant values
- tier_enforcement.py: FastAPI dependency, webhook validation, audit logging
- Feature flag modes: enforce, monitor, disabled
- Edge cases: empty tiers, unknown tiers, case sensitivity, null parents

Total: 30+ test cases across creation, upgrade, webhook, feature flag, and audit categories.
"""

import uuid
from unittest.mock import patch, AsyncMock

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

from src.partner.tier_constants import (
    ALLOWED_SUBTENANT_TIERS,
    BLOCKED_SUBTENANT_TIERS,
    MAX_HIERARCHY_DEPTH,
    TIER_HIERARCHY,
    TC_01_BLOCKED_CHILD_TIER,
    TC_03_DEPTH_EXCEEDED,
    TC_04_UPGRADE_BLOCKED,
    TC_06_WEBHOOK_TIER_BLOCKED,
    AUDIT_EVENT_CONSTRAINT_VIOLATION,
    AUDIT_EVENT_WEBHOOK_VIOLATION,
    validate_subtenant_tier,
    validate_hierarchy_depth,
    validate_tier_upgrade,
)

# Integration-test imports (guarded for environments where DB setup may differ)
try:
    from src.partner.tier_enforcement import (
        require_tier_guard,
        validate_tier_for_subtenant,
        _resolve_partner_context,
        PartnerContext,
    )
    from src.database.connection import Base, get_db
    from src.database.models import SoulTenant, SoulPartner, AuditLog
    _HAS_ENFORCEMENT = True
except ImportError:
    _HAS_ENFORCEMENT = False

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

needs_enforcement = pytest.mark.skipif(
    not _HAS_ENFORCEMENT,
    reason="src.partner.tier_enforcement not available",
)


# =========================================================================
#  Unit Tests -- tier_constants.py
# =========================================================================


class TestAllowedSubtenantTiers:
    """Verify ALLOWED_SUBTENANT_TIERS constant."""

    def test_allowed_tiers_contains_expected(self):
        assert ALLOWED_SUBTENANT_TIERS == frozenset({"community", "starter", "pro", "enterprise"})

    def test_blocked_tiers_contains_expected(self):
        assert BLOCKED_SUBTENANT_TIERS == frozenset({"mssp", "saas"})

    def test_allowed_and_blocked_are_disjoint(self):
        assert ALLOWED_SUBTENANT_TIERS & BLOCKED_SUBTENANT_TIERS == frozenset()

    def test_max_hierarchy_depth_is_one(self):
        assert MAX_HIERARCHY_DEPTH == 1

    def test_tier_hierarchy_ordering(self):
        assert TIER_HIERARCHY["community"] < TIER_HIERARCHY["starter"]
        assert TIER_HIERARCHY["starter"] < TIER_HIERARCHY["pro"]
        assert TIER_HIERARCHY["pro"] < TIER_HIERARCHY["enterprise"]
        assert TIER_HIERARCHY["enterprise"] < TIER_HIERARCHY["mssp"]
        assert TIER_HIERARCHY["mssp"] < TIER_HIERARCHY["saas"]


class TestValidateSubtenantTier:
    """Tests for validate_subtenant_tier()."""

    def test_community_allowed(self):
        assert validate_subtenant_tier("community") is True

    def test_starter_allowed(self):
        assert validate_subtenant_tier("starter") is True

    def test_pro_allowed(self):
        assert validate_subtenant_tier("pro") is True

    def test_enterprise_allowed(self):
        assert validate_subtenant_tier("enterprise") is True

    def test_mssp_blocked(self):
        assert validate_subtenant_tier("mssp") is False

    def test_saas_blocked(self):
        assert validate_subtenant_tier("saas") is False

    def test_empty_string_blocked(self):
        assert validate_subtenant_tier("") is False

    def test_unknown_tier_blocked(self):
        assert validate_subtenant_tier("platinum") is False

    def test_case_insensitive_allowed(self):
        """Tiers are normalized to lowercase internally."""
        assert validate_subtenant_tier("Community") is True
        assert validate_subtenant_tier("PRO") is True

    def test_case_insensitive_blocked(self):
        assert validate_subtenant_tier("MSSP") is False
        assert validate_subtenant_tier("SaaS") is False


class TestValidateHierarchyDepth:
    """Tests for validate_hierarchy_depth()."""

    def test_depth_zero_allowed(self):
        """Partner at depth 0 can create children."""
        assert validate_hierarchy_depth(0) is True

    def test_depth_one_blocked(self):
        """Sub-tenant at depth 1 cannot create children."""
        assert validate_hierarchy_depth(1) is False

    def test_depth_two_blocked(self):
        assert validate_hierarchy_depth(2) is False


class TestValidateTierUpgrade:
    """Tests for validate_tier_upgrade()."""

    def test_partner_subtenant_starter_to_pro_allowed(self):
        assert validate_tier_upgrade("starter", "pro", is_partner_subtenant=True) is True

    def test_partner_subtenant_pro_to_enterprise_allowed(self):
        assert validate_tier_upgrade("pro", "enterprise", is_partner_subtenant=True) is True

    def test_partner_subtenant_enterprise_to_mssp_blocked(self):
        assert validate_tier_upgrade("enterprise", "mssp", is_partner_subtenant=True) is False

    def test_partner_subtenant_any_to_saas_blocked(self):
        assert validate_tier_upgrade("starter", "saas", is_partner_subtenant=True) is False

    def test_non_partner_tenant_to_mssp_allowed(self):
        assert validate_tier_upgrade("enterprise", "mssp", is_partner_subtenant=False) is True

    def test_empty_requested_tier_blocked(self):
        assert validate_tier_upgrade("pro", "", is_partner_subtenant=False) is False

    def test_unknown_requested_tier_blocked(self):
        assert validate_tier_upgrade("pro", "platinum", is_partner_subtenant=False) is False

    def test_downgrade_blocked(self):
        """Upgrades must go to a higher tier."""
        assert validate_tier_upgrade("enterprise", "pro", is_partner_subtenant=False) is False


# =========================================================================
#  Integration Tests -- tier_enforcement.py (FastAPI dependency)
# =========================================================================

# Well-known test UUIDs
MSSP_TENANT_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
MSSP_PARTNER_ID = uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
SUBTENANT_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
NON_PARTNER_TENANT_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
DIRECT_ENTERPRISE_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")


@needs_enforcement
class TestTierEnforcementIntegration:
    """Integration tests using an in-memory SQLite database and test FastAPI routes."""

    @pytest_asyncio.fixture
    async def test_app(self):
        """
        Boot FastAPI app with in-memory DB, seed partner hierarchy,
        and register test routes guarded by require_tier_guard.
        """
        from fastapi import FastAPI, APIRouter, Depends
        from pydantic import BaseModel

        engine = create_async_engine(
            TEST_DATABASE_URL,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False,
        )

        test_app = FastAPI()

        async def override_get_db():
            async with session_factory() as session:
                try:
                    yield session
                    await session.commit()
                except Exception:
                    await session.rollback()
                    raise

        test_app.dependency_overrides[get_db] = override_get_db

        # Seed data
        async with session_factory() as session:
            # MSSP partner tenant (depth 0, no parent)
            mssp_tenant = SoulTenant(
                id=MSSP_TENANT_ID, name="MSSP Corp", slug="mssp-corp",
                tier="mssp", hierarchy_depth=0,
            )
            session.add(mssp_tenant)

            mssp_partner = SoulPartner(
                id=MSSP_PARTNER_ID,
                tenant_id=MSSP_TENANT_ID,
                name="MSSP Corp",
                contact_email="mssp@example.test",
                referral_code="MSSP001",
                status="active",
                commission_rate=0.25,
            )
            if hasattr(mssp_partner, "partner_type"):
                mssp_partner.partner_type = "mssp"
            session.add(mssp_partner)

            # Sub-tenant under MSSP partner (depth 1)
            subtenant = SoulTenant(
                id=SUBTENANT_ID, name="Sub Corp", slug="sub-corp",
                tier="enterprise", hierarchy_depth=1,
                parent_tenant_id=MSSP_TENANT_ID,
            )
            session.add(subtenant)

            # Non-partner tenant (no partner record, no parent)
            non_partner = SoulTenant(
                id=NON_PARTNER_TENANT_ID, name="Regular Tenant", slug="regular-tenant",
                tier="enterprise", hierarchy_depth=0,
            )
            session.add(non_partner)

            # Direct enterprise tenant (no parent, not a partner)
            direct_ent = SoulTenant(
                id=DIRECT_ENTERPRISE_ID, name="Direct Ent", slug="direct-ent",
                tier="enterprise", hierarchy_depth=0,
            )
            session.add(direct_ent)

            await session.commit()

        # Test schemas
        class CreateTenantBody(BaseModel):
            name: str = "Test"
            slug: str = "test"
            tier: str = "community"

        class UpgradeTenantBody(BaseModel):
            new_tier: str = "pro"

        # Test routes
        router = APIRouter(prefix="/test-tier")

        @router.post(
            "/create",
            dependencies=[Depends(require_tier_guard("create"))],
        )
        async def create_tenant_route(body: CreateTenantBody):
            return {"ok": True, "tier": body.tier}

        @router.post(
            "/upgrade",
            dependencies=[Depends(require_tier_guard("upgrade"))],
        )
        async def upgrade_tenant_route(body: UpgradeTenantBody):
            return {"ok": True, "new_tier": body.new_tier}

        test_app.include_router(router)

        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client, session_factory

        test_app.dependency_overrides.clear()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    # ----- Creation tests -----

    @pytest.mark.asyncio
    async def test_mssp_partner_creates_community_subtenant_allowed(self, test_app):
        """MSSP partner creates community sub-tenant -> ALLOW."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(MSSP_TENANT_ID)},
                json={"name": "Test", "slug": "t1", "tier": "community"},
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_mssp_partner_creates_starter_subtenant_allowed(self, test_app):
        """MSSP partner creates starter sub-tenant -> ALLOW."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(MSSP_TENANT_ID)},
                json={"name": "Test", "slug": "t2", "tier": "starter"},
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_mssp_partner_creates_pro_subtenant_allowed(self, test_app):
        """MSSP partner creates pro sub-tenant -> ALLOW."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(MSSP_TENANT_ID)},
                json={"name": "Test", "slug": "t3", "tier": "pro"},
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_mssp_partner_creates_enterprise_subtenant_allowed(self, test_app):
        """MSSP partner creates enterprise sub-tenant -> ALLOW."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(MSSP_TENANT_ID)},
                json={"name": "Test", "slug": "t4", "tier": "enterprise"},
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_mssp_partner_creates_mssp_subtenant_denied(self, test_app):
        """MSSP partner creates mssp sub-tenant -> DENY 403."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(MSSP_TENANT_ID)},
                json={"name": "Test", "slug": "t5", "tier": "mssp"},
            )
        assert resp.status_code == 403
        body = resp.json()["detail"]
        assert body["error_code"] == "TIER_CONSTRAINT_VIOLATION"
        assert body["constraint"] == TC_01_BLOCKED_CHILD_TIER

    @pytest.mark.asyncio
    async def test_mssp_partner_creates_saas_subtenant_denied(self, test_app):
        """MSSP partner creates saas sub-tenant -> DENY 403."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(MSSP_TENANT_ID)},
                json={"name": "Test", "slug": "t6", "tier": "saas"},
            )
        assert resp.status_code == 403
        body = resp.json()["detail"]
        assert body["constraint"] == TC_01_BLOCKED_CHILD_TIER

    @pytest.mark.asyncio
    async def test_non_partner_tenant_creates_any_tier_allowed(self, test_app):
        """Non-partner tenant is not constrained by the tier guard."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(NON_PARTNER_TENANT_ID)},
                json={"name": "Test", "slug": "t7", "tier": "mssp"},
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_partner_subtenant_tries_to_create_child_denied(self, test_app):
        """Partner sub-tenant tries to create sub-sub-tenant -> DENY (depth violation)."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(SUBTENANT_ID)},
                json={"name": "Test", "slug": "t8", "tier": "community"},
            )
        assert resp.status_code == 403
        body = resp.json()["detail"]
        assert body["constraint"] == TC_03_DEPTH_EXCEEDED

    # ----- Upgrade tests -----

    @pytest.mark.asyncio
    async def test_partner_subtenant_upgrade_starter_to_pro_allowed(self, test_app):
        """Partner sub-tenant upgrades to pro -> ALLOW."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/upgrade",
                headers={"X-Tenant-ID": str(SUBTENANT_ID)},
                json={"new_tier": "pro"},
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_partner_subtenant_upgrade_to_enterprise_allowed(self, test_app):
        """Partner sub-tenant upgrades to enterprise -> ALLOW."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/upgrade",
                headers={"X-Tenant-ID": str(SUBTENANT_ID)},
                json={"new_tier": "enterprise"},
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_partner_subtenant_upgrade_to_mssp_denied(self, test_app):
        """Partner sub-tenant upgrades to mssp -> DENY 403."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/upgrade",
                headers={"X-Tenant-ID": str(SUBTENANT_ID)},
                json={"new_tier": "mssp"},
            )
        assert resp.status_code == 403
        body = resp.json()["detail"]
        assert body["constraint"] == TC_04_UPGRADE_BLOCKED

    @pytest.mark.asyncio
    async def test_partner_subtenant_upgrade_to_saas_denied(self, test_app):
        """Partner sub-tenant upgrades to saas -> DENY 403."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/upgrade",
                headers={"X-Tenant-ID": str(SUBTENANT_ID)},
                json={"new_tier": "saas"},
            )
        assert resp.status_code == 403
        body = resp.json()["detail"]
        assert body["constraint"] == TC_04_UPGRADE_BLOCKED

    @pytest.mark.asyncio
    async def test_non_partner_tenant_upgrade_to_mssp_allowed(self, test_app):
        """Non-partner tenant upgrades to mssp -> ALLOW (not constrained)."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/upgrade",
                headers={"X-Tenant-ID": str(NON_PARTNER_TENANT_ID)},
                json={"new_tier": "mssp"},
            )
        assert resp.status_code == 200

    # ----- Feature flag tests -----

    @pytest.mark.asyncio
    async def test_enforce_mode_blocks_violations(self, test_app):
        """TIER_GUARD_ENABLED=enforce -> blocks violations."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(MSSP_TENANT_ID)},
                json={"name": "Test", "slug": "ff1", "tier": "mssp"},
            )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_monitor_mode_logs_but_allows(self, test_app):
        """TIER_GUARD_ENABLED=monitor -> logs but allows (200 with warning header)."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "monitor"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(MSSP_TENANT_ID)},
                json={"name": "Test", "slug": "ff2", "tier": "mssp"},
            )
        assert resp.status_code == 200
        assert "X-Tier-Guard-Warning" in resp.headers
        assert TC_01_BLOCKED_CHILD_TIER in resp.headers["X-Tier-Guard-Warning"]

    @pytest.mark.asyncio
    async def test_disabled_mode_skips_entirely(self, test_app):
        """TIER_GUARD_ENABLED=disabled -> skips all checks."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "disabled"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(MSSP_TENANT_ID)},
                json={"name": "Test", "slug": "ff3", "tier": "mssp"},
            )
        assert resp.status_code == 200
        assert "X-Tier-Guard-Warning" not in resp.headers

    # ----- Edge case tests -----

    @pytest.mark.asyncio
    async def test_empty_tier_string_denied(self, test_app):
        """Empty tier string in create request -> guard returns (let Pydantic handle)."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(MSSP_TENANT_ID)},
                json={"name": "Test", "slug": "ec1", "tier": ""},
            )
        # Empty tier is not in allowed set, so it should be blocked
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_unknown_tier_string_denied(self, test_app):
        """Unknown tier string -> DENY for partner context."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(MSSP_TENANT_ID)},
                json={"name": "Test", "slug": "ec2", "tier": "platinum"},
            )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_null_parent_tenant_id_allowed(self, test_app):
        """Root tenant (null parent) is not constrained."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(DIRECT_ENTERPRISE_ID)},
                json={"name": "Test", "slug": "ec3", "tier": "mssp"},
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_case_sensitivity_mssp_uppercase_denied(self, test_app):
        """'MSSP' (uppercase) should still be blocked for partner."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(MSSP_TENANT_ID)},
                json={"name": "Test", "slug": "ec4", "tier": "MSSP"},
            )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_missing_tenant_header_passes_through(self, test_app):
        """No X-Tenant-ID header -> guard skips, lets downstream handle auth."""
        client, _ = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                json={"name": "Test", "slug": "ec5", "tier": "mssp"},
            )
        # Guard skips; the route itself succeeds (no other auth on test route)
        assert resp.status_code == 200

    # ----- Audit log tests -----

    @pytest.mark.asyncio
    async def test_violation_creates_audit_log_entry(self, test_app):
        """Tier constraint violation creates an audit log entry."""
        client, session_factory = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(MSSP_TENANT_ID)},
                json={"name": "Test", "slug": "au1", "tier": "mssp"},
            )
        assert resp.status_code == 403

        # Verify audit log entry was created
        from sqlalchemy import select as sa_select
        async with session_factory() as session:
            result = await session.execute(
                sa_select(AuditLog).where(
                    AuditLog.event_type == AUDIT_EVENT_CONSTRAINT_VIOLATION,
                    AuditLog.tenant_id == MSSP_TENANT_ID,
                )
            )
            audits = list(result.scalars().all())
            assert len(audits) >= 1
            latest = audits[-1]
            assert latest.action == "create"
            assert latest.decision == "deny"
            assert TC_01_BLOCKED_CHILD_TIER in latest.reason
            assert latest.context["requested_tier"] == "mssp"

    @pytest.mark.asyncio
    async def test_allowed_action_does_not_create_audit_entry(self, test_app):
        """Allowed creation does NOT produce a violation audit entry."""
        client, session_factory = test_app

        # Clear any existing audit entries first
        from sqlalchemy import select as sa_select, delete as sa_delete
        async with session_factory() as session:
            await session.execute(
                sa_delete(AuditLog).where(
                    AuditLog.event_type == AUDIT_EVENT_CONSTRAINT_VIOLATION,
                    AuditLog.tenant_id == MSSP_TENANT_ID,
                )
            )
            await session.commit()

        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(MSSP_TENANT_ID)},
                json={"name": "Test", "slug": "au2", "tier": "pro"},
            )
        assert resp.status_code == 200

        async with session_factory() as session:
            result = await session.execute(
                sa_select(AuditLog).where(
                    AuditLog.event_type == AUDIT_EVENT_CONSTRAINT_VIOLATION,
                    AuditLog.tenant_id == MSSP_TENANT_ID,
                )
            )
            audits = list(result.scalars().all())
            assert len(audits) == 0

    @pytest.mark.asyncio
    async def test_depth_violation_creates_audit_entry(self, test_app):
        """Sub-tenant depth violation creates audit log entry with TC-03."""
        client, session_factory = test_app
        with patch.dict("os.environ", {"TIER_GUARD_ENABLED": "enforce"}):
            resp = await client.post(
                "/test-tier/create",
                headers={"X-Tenant-ID": str(SUBTENANT_ID)},
                json={"name": "Test", "slug": "au3", "tier": "community"},
            )
        assert resp.status_code == 403

        from sqlalchemy import select as sa_select
        async with session_factory() as session:
            result = await session.execute(
                sa_select(AuditLog).where(
                    AuditLog.event_type == AUDIT_EVENT_CONSTRAINT_VIOLATION,
                    AuditLog.tenant_id == SUBTENANT_ID,
                )
            )
            audits = list(result.scalars().all())
            assert len(audits) >= 1
            latest = audits[-1]
            assert TC_03_DEPTH_EXCEEDED in latest.reason


# =========================================================================
#  Webhook validation tests (standalone function)
# =========================================================================


@needs_enforcement
class TestWebhookValidation:
    """Tests for validate_tier_for_subtenant() used by Stripe webhook handler."""

    @pytest_asyncio.fixture
    async def db_session(self):
        engine = create_async_engine(
            TEST_DATABASE_URL,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False,
        )

        async with session_factory() as session:
            # Seed a minimal tenant for audit log FK
            tenant = SoulTenant(
                id=MSSP_TENANT_ID, name="MSSP Corp", slug="mssp-wh",
                tier="mssp", hierarchy_depth=0,
            )
            session.add(tenant)
            await session.commit()

        async with session_factory() as session:
            yield session

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    @pytest.mark.asyncio
    async def test_webhook_enterprise_allowed(self, db_session):
        """Webhook setting sub-tenant to enterprise -> allowed."""
        ok, reason = await validate_tier_for_subtenant("enterprise", str(MSSP_TENANT_ID), db_session)
        assert ok is True
        assert reason == ""

    @pytest.mark.asyncio
    async def test_webhook_mssp_blocked(self, db_session):
        """Webhook setting sub-tenant to mssp -> blocked."""
        ok, reason = await validate_tier_for_subtenant("mssp", str(MSSP_TENANT_ID), db_session)
        assert ok is False
        assert "mssp" in reason.lower()

    @pytest.mark.asyncio
    async def test_webhook_saas_blocked(self, db_session):
        """Webhook setting sub-tenant to saas -> blocked."""
        ok, reason = await validate_tier_for_subtenant("saas", str(MSSP_TENANT_ID), db_session)
        assert ok is False
        assert "saas" in reason.lower()

    @pytest.mark.asyncio
    async def test_webhook_no_parent_allowed(self, db_session):
        """Webhook on direct tenant (no parent) -> allowed for any tier."""
        ok, reason = await validate_tier_for_subtenant("mssp", "", db_session)
        assert ok is True

    @pytest.mark.asyncio
    async def test_webhook_null_parent_allowed(self, db_session):
        """Webhook with None parent -> allowed."""
        ok, reason = await validate_tier_for_subtenant("mssp", None, db_session)
        assert ok is True

    @pytest.mark.asyncio
    async def test_webhook_violation_creates_audit_entry(self, db_session):
        """Webhook tier violation creates an audit log entry."""
        ok, reason = await validate_tier_for_subtenant("mssp", str(MSSP_TENANT_ID), db_session)
        assert ok is False

        from sqlalchemy import select as sa_select
        result = await db_session.execute(
            sa_select(AuditLog).where(
                AuditLog.event_type == AUDIT_EVENT_WEBHOOK_VIOLATION,
            )
        )
        audits = list(result.scalars().all())
        assert len(audits) >= 1
        latest = audits[-1]
        assert TC_06_WEBHOOK_TIER_BLOCKED in latest.reason
        assert latest.context["attempted_tier"] == "mssp"
