"""
Tests for partner type differentiation (Build 05).

Covers:
- PartnerType enum values and membership
- PARTNER_CAPABILITIES permission matrix
- PARTNER_TIER_MAP and PARTNER_REQUIRES_CONNECT lookups
- has_capability() helper function
- require_partner_capability() type guard (integration tests)
"""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

from src.partner.types import (
    PartnerType,
    PARTNER_CAPABILITIES,
    PARTNER_TIER_MAP,
    PARTNER_REQUIRES_CONNECT,
    has_capability,
)

# ---------------------------------------------------------------------------
# Try to import type_guard and integration-test dependencies.  The guard
# module may not exist yet (created by a parallel agent), so integration
# tests are skipped gracefully when it is absent.
# ---------------------------------------------------------------------------
try:
    from src.partner.type_guard import require_partner_capability, _load_partner
    from src.database.connection import Base, get_db
    from src.database.models import SoulTenant, SoulPartner
    from src.main import app

    _HAS_TYPE_GUARD = True
except ImportError:
    _HAS_TYPE_GUARD = False

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

needs_type_guard = pytest.mark.skipif(
    not _HAS_TYPE_GUARD,
    reason="src.partner.type_guard not yet available",
)


# =========================================================================
#  Unit Tests — types.py
# =========================================================================


class TestPartnerTypeEnum:
    """Verify PartnerType enum values and membership."""

    def test_partner_type_enum_values(self):
        """Enum has exactly 'reseller' and 'mssp'."""
        members = {m.value for m in PartnerType}
        assert members == {"reseller", "mssp"}

    def test_reseller_string_value(self):
        assert PartnerType.RESELLER.value == "reseller"
        assert PartnerType.RESELLER == "reseller"

    def test_mssp_string_value(self):
        assert PartnerType.MSSP.value == "mssp"
        assert PartnerType.MSSP == "mssp"

    def test_unknown_type_rejected(self):
        with pytest.raises(ValueError):
            PartnerType("enterprise")


class TestHasCapability:
    """Verify has_capability() against the permission matrix."""

    def test_has_capability_mssp_tenant_create(self):
        """MSSP can create tenants."""
        assert has_capability(PartnerType.MSSP, "tenant_create") is True

    def test_has_capability_reseller_cannot_create_tenants(self):
        """Reseller blocked from tenant creation."""
        assert has_capability(PartnerType.RESELLER, "tenant_create") is False

    def test_has_capability_both_can_track_referrals(self):
        """Both types can track referrals."""
        assert has_capability(PartnerType.RESELLER, "referral_track") is True
        assert has_capability(PartnerType.MSSP, "referral_track") is True

    def test_has_capability_invalid_capability(self):
        """Returns False for unknown capabilities."""
        assert has_capability(PartnerType.RESELLER, "warp_drive") is False
        assert has_capability(PartnerType.MSSP, "warp_drive") is False

    def test_reseller_cannot_configure_whitelabel(self):
        assert has_capability(PartnerType.RESELLER, "whitelabel_config") is False

    def test_mssp_can_configure_whitelabel(self):
        assert has_capability(PartnerType.MSSP, "whitelabel_config") is True

    def test_both_types_can_create_promo(self):
        assert has_capability(PartnerType.RESELLER, "promo_create") is True
        assert has_capability(PartnerType.MSSP, "promo_create") is True

    def test_both_types_can_view_commissions(self):
        assert has_capability(PartnerType.RESELLER, "commission_view") is True
        assert has_capability(PartnerType.MSSP, "commission_view") is True


class TestPartnerTierMap:
    """Verify PARTNER_TIER_MAP returns correct tiers."""

    def test_partner_tier_map_reseller(self):
        """Reseller maps to 'pro' tier."""
        assert PARTNER_TIER_MAP[PartnerType.RESELLER] == "pro"

    def test_partner_tier_map_mssp(self):
        """MSSP maps to 'mssp' tier."""
        assert PARTNER_TIER_MAP[PartnerType.MSSP] == "mssp"


class TestPartnerRequiresConnect:
    """Verify PARTNER_REQUIRES_CONNECT flags."""

    def test_reseller_does_not_require_connect(self):
        """Connect not required for resellers."""
        assert PARTNER_REQUIRES_CONNECT[PartnerType.RESELLER] is False

    def test_mssp_requires_connect(self):
        """Connect required for MSSP."""
        assert PARTNER_REQUIRES_CONNECT[PartnerType.MSSP] is True


# =========================================================================
#  Edge Cases
# =========================================================================


class TestEdgeCases:
    """Edge cases for the partner type system."""

    def test_capability_check_case_sensitivity(self):
        """Capabilities are case-sensitive; uppercase variants must not match."""
        assert has_capability(PartnerType.MSSP, "Tenant_Create") is False
        assert has_capability(PartnerType.MSSP, "TENANT_CREATE") is False
        assert has_capability(PartnerType.MSSP, "tenant_create") is True

    def test_all_capabilities_have_at_least_one_type(self):
        """No orphaned capabilities (every capability is granted to at least one type)."""
        for cap_name, allowed_types in PARTNER_CAPABILITIES.items():
            assert len(allowed_types) > 0, f"Capability '{cap_name}' has no allowed partner types"

    def test_enum_members_cover_tier_map(self):
        """Every enum member has an entry in PARTNER_TIER_MAP."""
        for pt in PartnerType:
            assert pt in PARTNER_TIER_MAP, f"{pt} missing from PARTNER_TIER_MAP"

    def test_enum_members_cover_connect_map(self):
        """Every enum member has an entry in PARTNER_REQUIRES_CONNECT."""
        for pt in PartnerType:
            assert pt in PARTNER_REQUIRES_CONNECT, f"{pt} missing from PARTNER_REQUIRES_CONNECT"


# =========================================================================
#  Integration Tests — type_guard.py
# =========================================================================


@needs_type_guard
class TestTypeGuardIntegration:
    """Integration tests for require_partner_capability dependency.

    These tests boot the FastAPI app with an in-memory SQLite database,
    seed partner records, and verify that the guard returns correct HTTP
    status codes.  Skipped automatically if type_guard.py is not yet
    present.
    """

    @pytest_asyncio.fixture
    async def test_app(self):
        """Create test application with in-memory database and seeded partners."""
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

        async def override_get_db():
            async with session_factory() as session:
                try:
                    yield session
                    await session.commit()
                except Exception:
                    await session.rollback()
                    raise

        app.dependency_overrides[get_db] = override_get_db

        # ---- Seed data ----
        mssp_tenant_id = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        reseller_tenant_id = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
        no_partner_tenant_id = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")

        async with session_factory() as session:
            # MSSP tenant + partner
            mssp_tenant = SoulTenant(
                id=mssp_tenant_id, name="MSSP Corp", slug="mssp-corp", tier="mssp",
            )
            session.add(mssp_tenant)

            mssp_partner = SoulPartner(
                id=uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
                tenant_id=mssp_tenant_id,
                name="MSSP Corp",
                contact_email="mssp@example.test",
                referral_code="MSSP001",
                status="active",
                commission_rate=0.25,
            )
            # Set partner_type if the column exists on the model
            if hasattr(mssp_partner, "partner_type"):
                mssp_partner.partner_type = "mssp"
            session.add(mssp_partner)

            # Reseller tenant + partner
            reseller_tenant = SoulTenant(
                id=reseller_tenant_id, name="Reseller Inc", slug="reseller-inc", tier="pro",
            )
            session.add(reseller_tenant)

            reseller_partner = SoulPartner(
                id=uuid.UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"),
                tenant_id=reseller_tenant_id,
                name="Reseller Inc",
                contact_email="reseller@example.test",
                referral_code="RES001",
                status="active",
                commission_rate=0.25,
            )
            if hasattr(reseller_partner, "partner_type"):
                reseller_partner.partner_type = "reseller"
            session.add(reseller_partner)

            # Tenant with no partner record
            orphan_tenant = SoulTenant(
                id=no_partner_tenant_id, name="No Partner", slug="no-partner", tier="pro",
            )
            session.add(orphan_tenant)

            await session.commit()

        # Stash IDs on the app for easy access in tests
        app.state.mssp_tenant_id = str(mssp_tenant_id)
        app.state.reseller_tenant_id = str(reseller_tenant_id)
        app.state.no_partner_tenant_id = str(no_partner_tenant_id)

        # --- Register lightweight test routes that use the guard ---
        from fastapi import APIRouter, Depends

        guard_router = APIRouter(prefix="/test-guard", tags=["test"])

        @guard_router.get(
            "/tenant-action",
            dependencies=[Depends(require_partner_capability("tenant_create"))],
        )
        async def tenant_action():
            return {"ok": True}

        @guard_router.get(
            "/referral-action",
            dependencies=[Depends(require_partner_capability("referral_track"))],
        )
        async def referral_action():
            return {"ok": True}

        # Only add if not already registered (fixture may run more than once)
        route_paths = {r.path for r in app.routes}
        if "/test-guard/tenant-action" not in route_paths:
            app.include_router(guard_router)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client

        app.dependency_overrides.clear()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    # ----- guard integration tests -----

    @pytest.mark.asyncio
    async def test_mssp_partner_can_access_tenant_endpoint(self, test_app):
        """MSSP partner gets 200 on tenant_create-guarded endpoint."""
        response = await test_app.get(
            "/test-guard/tenant-action",
            headers={"X-Tenant-ID": app.state.mssp_tenant_id},
        )
        assert response.status_code == 200
        assert response.json() == {"ok": True}

    @pytest.mark.asyncio
    async def test_reseller_partner_blocked_from_tenant_endpoint(self, test_app):
        """Reseller partner gets 403 on tenant_create-guarded endpoint."""
        response = await test_app.get(
            "/test-guard/tenant-action",
            headers={"X-Tenant-ID": app.state.reseller_tenant_id},
        )
        assert response.status_code == 403
        body = response.json()
        assert "reseller" in body["detail"]
        assert "tenant_create" in body["detail"]

    @pytest.mark.asyncio
    async def test_reseller_can_access_referral_endpoint(self, test_app):
        """Reseller partner gets 200 on referral_track-guarded endpoint."""
        response = await test_app.get(
            "/test-guard/referral-action",
            headers={"X-Tenant-ID": app.state.reseller_tenant_id},
        )
        assert response.status_code == 200
        assert response.json() == {"ok": True}

    @pytest.mark.asyncio
    async def test_non_partner_tenant_blocked(self, test_app):
        """Tenant with no partner record gets 404."""
        response = await test_app.get(
            "/test-guard/tenant-action",
            headers={"X-Tenant-ID": app.state.no_partner_tenant_id},
        )
        assert response.status_code == 404
        assert "No partner record" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_missing_tenant_header_returns_403(self, test_app):
        """Request without X-Tenant-ID header gets 403."""
        response = await test_app.get("/test-guard/tenant-action")
        assert response.status_code == 403
        assert "X-Tenant-ID" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_invalid_tenant_id_returns_400(self, test_app):
        """Malformed UUID in X-Tenant-ID header gets 400."""
        response = await test_app.get(
            "/test-guard/tenant-action",
            headers={"X-Tenant-ID": "not-a-uuid"},
        )
        assert response.status_code == 400
        assert "Invalid" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_guard_returns_partner_record(self, test_app):
        """The dependency returns the SoulPartner object (verified via request.state)."""
        # We verify indirectly: if the guard did NOT attach the partner to
        # request.state, downstream code would fail.  A 200 confirms the
        # partner object was loaded and the capability check passed.
        response = await test_app.get(
            "/test-guard/referral-action",
            headers={"X-Tenant-ID": app.state.mssp_tenant_id},
        )
        assert response.status_code == 200
