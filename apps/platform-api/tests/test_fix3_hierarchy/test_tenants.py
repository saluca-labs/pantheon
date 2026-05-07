"""T-1 through T-4: unit tests for get_descendant_tenant_ids."""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import text

from tiresias.storage.tenants import get_descendant_tenant_ids
from .conftest import (
    ROOT_ID, ALPHA_ID, IVORY_ID, RHO_ID,
    RESEARCH_ROOT_ID, XI_ID, SIGMA_ID,
)


@pytest.mark.asyncio
async def test_T1_leaf_tenant_returns_self(db_session):
    """T-1: leaf tenant with no children returns [self]."""
    result = await get_descendant_tenant_ids(db_session, ALPHA_ID)
    assert result == [ALPHA_ID], f"Expected [ALPHA_ID], got {result}"


@pytest.mark.asyncio
async def test_T2_root_with_children(db_session):
    """T-2: root with 3 children returns 4 UUIDs (root + 3 children)."""
    result = await get_descendant_tenant_ids(db_session, ROOT_ID)
    assert len(result) == 4
    assert result[0] == ROOT_ID, "root must be first"
    assert set(result[1:]) == {ALPHA_ID, IVORY_ID, RHO_ID}


@pytest.mark.asyncio
async def test_T3_nested_hierarchy(db_session):
    """T-3: research root has 2 children — returns 3 UUIDs total."""
    result = await get_descendant_tenant_ids(db_session, RESEARCH_ROOT_ID)
    assert len(result) == 3
    assert result[0] == RESEARCH_ROOT_ID
    assert set(result[1:]) == {XI_ID, SIGMA_ID}


@pytest.mark.asyncio
async def test_T4_unknown_tenant_returns_self(db_session):
    """T-4: tenant not in _soul_tenants → safe fallback [tenant_id]."""
    ghost = "ffffffff-ffff-4fff-afff-ffffffffffff"
    result = await get_descendant_tenant_ids(db_session, ghost)
    assert result == [ghost]


@pytest.mark.asyncio
async def test_T_isolation_saluca_vs_research(db_session):
    """Isolation: saluca root subtree must not include research subtree."""
    saluca_ids = set(await get_descendant_tenant_ids(db_session, ROOT_ID))
    research_ids = set(await get_descendant_tenant_ids(db_session, RESEARCH_ROOT_ID))
    overlap = saluca_ids & research_ids
    assert not overlap, f"Subtrees overlap: {overlap}"


@pytest.mark.asyncio
async def test_T_validate_bad_uuid():
    """Invalid UUID must raise ValueError before any DB hit."""
    from sqlalchemy.ext.asyncio import AsyncSession
    # We don't even need a real session — validation fires before execute
    with pytest.raises(ValueError, match="Invalid UUID"):
        from unittest.mock import AsyncMock
        mock_session = AsyncMock(spec=AsyncSession)
        await get_descendant_tenant_ids(mock_session, "not-a-uuid")
