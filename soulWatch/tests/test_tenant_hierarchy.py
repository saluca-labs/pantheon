"""
Unit tests for soulwatch tenant hierarchy expansion (B5-SOULWATCH-HIERARCHY).

Uses an in-memory SQLite database so no Cloud SQL connection is needed.
The _soul_tenants table is created inline per test.
"""

from __future__ import annotations

import uuid
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from soulWatch.src.database.tenants import (
    get_descendant_tenant_ids,
    _validate_uuid,
    _MAX_DESCENDANT_DEPTH,
    _MAX_DESCENDANT_COUNT,
)

# ---------------------------------------------------------------------------
# Fixtures — in-memory SQLite DB with _soul_tenants table
# ---------------------------------------------------------------------------

CREATE_TENANTS = """
CREATE TABLE IF NOT EXISTS _soul_tenants (
    id TEXT PRIMARY KEY,
    parent_tenant_id TEXT,
    status TEXT NOT NULL DEFAULT 'active'
)
"""


@pytest_asyncio.fixture
async def sqlite_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.execute(text(CREATE_TENANTS))
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


async def _insert_tenant(
    session: AsyncSession,
    tid: str,
    parent: str | None = None,
    status: str = "active",
) -> None:
    await session.execute(
        text(
            "INSERT INTO _soul_tenants (id, parent_tenant_id, status) "
            "VALUES (:id, :parent, :status)"
        ),
        {"id": tid, "parent": parent, "status": status},
    )
    await session.flush()


def _uid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Helper: force the dialect detection to return sqlite
# (get_descendant_tenant_ids delegates dialect detection via session.get_bind)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestValidateUUID:
    def test_valid_uuid(self):
        uid = str(uuid.uuid4())
        assert _validate_uuid(uid) == uid

    def test_invalid_uuid_raises(self):
        with pytest.raises(ValueError, match="Invalid UUID"):
            _validate_uuid("not-a-uuid")

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            _validate_uuid("")


class TestHierarchyOff:
    """When hierarchy mode is OFF, only the root tenant's rows match.
    We test the CTE itself; router-level flag enforcement is in integration tests.
    """

    @pytest.mark.asyncio
    async def test_leaf_tenant_no_descendants(self, sqlite_session: AsyncSession):
        """A leaf tenant returns only itself."""
        root = _uid()
        child = _uid()
        await _insert_tenant(sqlite_session, root)
        await _insert_tenant(sqlite_session, child, parent=root)

        ids = await get_descendant_tenant_ids(sqlite_session, child)
        assert ids == [child]

    @pytest.mark.asyncio
    async def test_root_not_found_returns_fallback(self, sqlite_session: AsyncSession):
        """If root is absent from _soul_tenants, fallback to [tenant_id]."""
        missing = _uid()
        ids = await get_descendant_tenant_ids(sqlite_session, missing)
        assert ids == [missing]


class TestHierarchyOn:
    """Core hierarchy expansion tests — verify root + descendants are returned."""

    @pytest.mark.asyncio
    async def test_root_with_two_children(self, sqlite_session: AsyncSession):
        root = _uid()
        c1 = _uid()
        c2 = _uid()
        await _insert_tenant(sqlite_session, root)
        await _insert_tenant(sqlite_session, c1, parent=root)
        await _insert_tenant(sqlite_session, c2, parent=root)

        ids = await get_descendant_tenant_ids(sqlite_session, root)
        assert root in ids
        assert c1 in ids
        assert c2 in ids
        assert len(ids) == 3
        # Root must be first
        assert ids[0] == root

    @pytest.mark.asyncio
    async def test_deep_hierarchy(self, sqlite_session: AsyncSession):
        """root -> a -> b -> c (depth 3) all returned."""
        root = _uid()
        a = _uid()
        b = _uid()
        c = _uid()
        await _insert_tenant(sqlite_session, root)
        await _insert_tenant(sqlite_session, a, parent=root)
        await _insert_tenant(sqlite_session, b, parent=a)
        await _insert_tenant(sqlite_session, c, parent=b)

        ids = await get_descendant_tenant_ids(sqlite_session, root)
        assert set(ids) == {root, a, b, c}
        assert ids[0] == root

    @pytest.mark.asyncio
    async def test_inactive_tenant_excluded(self, sqlite_session: AsyncSession):
        """Inactive descendants are excluded from the result set."""
        root = _uid()
        active_child = _uid()
        inactive_child = _uid()
        await _insert_tenant(sqlite_session, root)
        await _insert_tenant(sqlite_session, active_child, parent=root)
        await _insert_tenant(sqlite_session, inactive_child, parent=root, status="inactive")

        ids = await get_descendant_tenant_ids(sqlite_session, root)
        assert inactive_child not in ids
        assert active_child in ids

    @pytest.mark.asyncio
    async def test_leaf_tenant_returns_only_itself(self, sqlite_session: AsyncSession):
        """Hierarchy ON with a leaf tenant returns [leaf] — same as OFF."""
        root = _uid()
        leaf = _uid()
        await _insert_tenant(sqlite_session, root)
        await _insert_tenant(sqlite_session, leaf, parent=root)

        ids_leaf = await get_descendant_tenant_ids(sqlite_session, leaf)
        assert ids_leaf == [leaf]

    @pytest.mark.asyncio
    async def test_hierarchy_on_vs_off_differ_for_root(self, sqlite_session: AsyncSession):
        """Root query returns >1 tenant when descendants exist."""
        root = _uid()
        child = _uid()
        await _insert_tenant(sqlite_session, root)
        await _insert_tenant(sqlite_session, child, parent=root)

        ids_root = await get_descendant_tenant_ids(sqlite_session, root)
        assert len(ids_root) > 1, "Root with children should return multiple tenants"

        ids_leaf = await get_descendant_tenant_ids(sqlite_session, child)
        assert len(ids_leaf) == 1, "Leaf has no children; should return only itself"


class TestDepthCap:
    """Depth cap prevents traversal beyond _MAX_DESCENDANT_DEPTH levels."""

    @pytest.mark.asyncio
    async def test_depth_cap_stops_traversal(self, sqlite_session: AsyncSession):
        """Build a chain deeper than the max depth; nodes beyond cap not returned."""
        # Build a chain of max_depth + 3 nodes
        chain = [_uid() for _ in range(_MAX_DESCENDANT_DEPTH + 3)]
        await _insert_tenant(sqlite_session, chain[0])
        for i in range(1, len(chain)):
            await _insert_tenant(sqlite_session, chain[i], parent=chain[i - 1])

        ids = await get_descendant_tenant_ids(sqlite_session, chain[0])
        # Nodes beyond depth cap should not appear
        assert chain[-1] not in ids
        assert chain[-2] not in ids
        # Root must be included
        assert chain[0] in ids


class TestCountCap:
    """Count cap trims the result to _MAX_DESCENDANT_COUNT."""

    @pytest.mark.asyncio
    async def test_count_cap_applied(self, sqlite_session: AsyncSession):
        """When descendant count exceeds cap, result is trimmed."""
        root = _uid()
        await _insert_tenant(sqlite_session, root)
        # Insert cap+10 children under root
        for _ in range(_MAX_DESCENDANT_COUNT + 10):
            await _insert_tenant(sqlite_session, _uid(), parent=root)

        ids = await get_descendant_tenant_ids(sqlite_session, root)
        assert len(ids) <= _MAX_DESCENDANT_COUNT
        assert ids[0] == root


class TestRouterEndpointTenantGuard:
    """Verify 401 is returned when tenant_id is missing from list endpoints."""

    @pytest.mark.asyncio
    async def test_detections_missing_tenant_returns_401(self):
        from fastapi.testclient import TestClient
        from unittest.mock import patch, AsyncMock
        import soulWatch.src.detection.router as dr

        # Minimal FastAPI app with just the detection router
        from fastapi import FastAPI
        app = FastAPI()
        app.include_router(dr.router)

        with TestClient(app) as client:
            resp = client.get("/watch/v1/detections")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_anomalies_missing_tenant_returns_401(self):
        from fastapi.testclient import TestClient
        import soulWatch.src.analytics.router as ar

        from fastapi import FastAPI
        app = FastAPI()
        app.include_router(ar.router)

        with TestClient(app) as client:
            resp = client.get("/watch/v1/anomalies")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_quarantines_missing_tenant_returns_401(self):
        from fastapi.testclient import TestClient
        import soulWatch.src.enforcement.router as er

        from fastapi import FastAPI
        app = FastAPI()
        app.include_router(er.router)

        with TestClient(app) as client:
            resp = client.get("/watch/v1/quarantines")
        assert resp.status_code == 401
