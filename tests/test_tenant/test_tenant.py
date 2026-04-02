"""
Tests for tenant management — creation, listing, status lifecycle.
"""

import uuid

import pytest
import pytest_asyncio

from src.middleware.tenant import (
    create_tenant,
    resolve_tenant,
    resolve_tenant_by_slug,
    list_tenants,
    update_tenant_status,
    TenantContext,
)


class TestTenantCreation:
    """Tests for tenant creation."""

    @pytest.mark.asyncio
    async def test_create_tenant(self, db_session):
        """Create a new tenant with all fields."""
        tenant = await create_tenant(
            db_session,
            name="Acme Corp",
            slug="acme-corp",
            tier="enterprise",
            metadata={"industry": "technology"},
        )
        assert tenant.name == "Acme Corp"
        assert tenant.slug == "acme-corp"
        assert tenant.tier == "enterprise"
        assert tenant.status == "active"
        assert tenant.metadata_ == {"industry": "technology"}

    @pytest.mark.asyncio
    async def test_create_tenant_defaults(self, db_session):
        """Create tenant with default tier."""
        tenant = await create_tenant(
            db_session,
            name="Startup XYZ",
            slug="startup-xyz",
        )
        assert tenant.tier == "community"
        assert tenant.status == "active"

    @pytest.mark.asyncio
    async def test_create_tenant_unique_slug(self, db_session):
        """Tenant slugs must be unique."""
        await create_tenant(db_session, name="First", slug="unique-slug")
        await db_session.flush()

        # SQLAlchemy will raise on duplicate slug
        from sqlalchemy.exc import IntegrityError
        with pytest.raises(IntegrityError):
            await create_tenant(db_session, name="Second", slug="unique-slug")
            await db_session.flush()


class TestTenantResolution:
    """Tests for tenant lookup."""

    @pytest.mark.asyncio
    async def test_resolve_by_id(self, db_session):
        """Resolve tenant by UUID."""
        tenant = await create_tenant(db_session, name="Resolve Test", slug="resolve-test")
        await db_session.flush()

        resolved = await resolve_tenant(db_session, tenant.id)
        assert resolved is not None
        assert resolved.name == "Resolve Test"

    @pytest.mark.asyncio
    async def test_resolve_by_slug(self, db_session):
        """Resolve tenant by slug."""
        await create_tenant(db_session, name="Slug Test", slug="slug-test")
        await db_session.flush()

        resolved = await resolve_tenant_by_slug(db_session, "slug-test")
        assert resolved is not None
        assert resolved.name == "Slug Test"

    @pytest.mark.asyncio
    async def test_resolve_nonexistent(self, db_session):
        """Non-existent tenant returns None."""
        resolved = await resolve_tenant(
            db_session, uuid.UUID("99999999-9999-9999-9999-999999999999")
        )
        assert resolved is None

    @pytest.mark.asyncio
    async def test_resolve_by_slug_nonexistent(self, db_session):
        """Non-existent slug returns None."""
        resolved = await resolve_tenant_by_slug(db_session, "does-not-exist")
        assert resolved is None


class TestTenantLifecycle:
    """Tests for tenant status changes."""

    @pytest.mark.asyncio
    async def test_suspend_tenant(self, db_session):
        """Suspend an active tenant."""
        tenant = await create_tenant(db_session, name="Suspend Me", slug="suspend-me")
        await db_session.flush()

        result = await update_tenant_status(db_session, tenant.id, "suspended")
        assert result is not None
        assert result.status == "suspended"

    @pytest.mark.asyncio
    async def test_reactivate_tenant(self, db_session):
        """Reactivate a suspended tenant."""
        tenant = await create_tenant(db_session, name="Reactivate", slug="reactivate")
        await db_session.flush()

        await update_tenant_status(db_session, tenant.id, "suspended")
        await db_session.flush()

        result = await update_tenant_status(db_session, tenant.id, "active")
        assert result is not None
        assert result.status == "active"

    @pytest.mark.asyncio
    async def test_list_tenants(self, db_session):
        """List all tenants."""
        await create_tenant(db_session, name="T1", slug="list-t1")
        await create_tenant(db_session, name="T2", slug="list-t2")
        await db_session.flush()

        tenants = await list_tenants(db_session)
        assert len(tenants) >= 2

    @pytest.mark.asyncio
    async def test_list_tenants_by_status(self, db_session):
        """List tenants filtered by status."""
        t = await create_tenant(db_session, name="Filter", slug="filter-test")
        await db_session.flush()
        await update_tenant_status(db_session, t.id, "suspended")
        await db_session.flush()

        suspended = await list_tenants(db_session, status="suspended")
        assert any(t2.slug == "filter-test" for t2 in suspended)


class TestTenantContext:
    """Tests for TenantContext data class."""

    def test_tenant_context_creation(self):
        """TenantContext holds all fields."""
        ctx = TenantContext(
            tenant_id=uuid.uuid4(),
            tenant_slug="test",
            tenant_name="Test Corp",
            tier="enterprise",
            status="active",
        )
        assert ctx.tenant_slug == "test"
        assert ctx.tier == "enterprise"
