"""
Tenant isolation enforcement for MSSP multi-tenant queries.

All cross-tenant queries MUST pass through these functions to guarantee
that results are scoped strictly to the caller's tenant hierarchy.
A tenant can only see itself and its descendants -- never siblings,
parent data, or tenants in unrelated hierarchies.
"""

import uuid
from typing import Optional

import structlog
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulTenant

logger = structlog.get_logger(__name__)

MAX_HIERARCHY_DEPTH = 3


async def get_tenant_subtree(
    db: AsyncSession,
    root_tenant_id: uuid.UUID,
    include_root: bool = True,
) -> list[SoulTenant]:
    """
    Return all tenants in the subtree rooted at root_tenant_id.

    Uses iterative BFS to avoid recursive CTEs (keeps it cross-DB compatible).
    At max_depth=3, the worst case is 1 + N + N^2 + N^3 queries which is
    acceptable for MSSP scale (typically <100 child tenants).

    Args:
        db: Async DB session.
        root_tenant_id: The MSSP operator's tenant UUID.
        include_root: If True, the root tenant itself is included in the result.

    Returns:
        List of SoulTenant ORM objects strictly within this hierarchy.
    """
    visited: set[uuid.UUID] = set()
    result: list[SoulTenant] = []
    queue: list[uuid.UUID] = [root_tenant_id]

    while queue:
        current_ids = list(queue)
        queue = []

        rows = await db.execute(
            select(SoulTenant).where(
                SoulTenant.parent_tenant_id.in_(current_ids)
                if len(current_ids) > 1
                else SoulTenant.parent_tenant_id == current_ids[0]
            )
        )
        children = list(rows.scalars().all())

        for child in children:
            if child.id not in visited:
                visited.add(child.id)
                result.append(child)
                queue.append(child.id)

    if include_root:
        root_row = await db.execute(
            select(SoulTenant).where(SoulTenant.id == root_tenant_id)
        )
        root = root_row.scalar_one_or_none()
        if root:
            result.insert(0, root)

    return result


async def get_child_tenant_ids(
    db: AsyncSession,
    root_tenant_id: uuid.UUID,
    include_root: bool = True,
) -> list[uuid.UUID]:
    """
    Lightweight variant of get_tenant_subtree -- returns only UUIDs.
    Use this when building SQL WHERE tenant_id IN (...) filters.
    """
    tenants = await get_tenant_subtree(db, root_tenant_id, include_root=include_root)
    return [t.id for t in tenants]


async def assert_in_hierarchy(
    db: AsyncSession,
    root_tenant_id: uuid.UUID,
    target_tenant_id: uuid.UUID,
) -> None:
    """
    Raise HTTP 403 if target_tenant_id is NOT within root_tenant_id's subtree.

    Call this before any cross-tenant data access to enforce isolation.

    Raises:
        HTTPException(403): If target_tenant_id is outside the caller's hierarchy.
    """
    subtree_ids = await get_child_tenant_ids(db, root_tenant_id, include_root=True)
    if target_tenant_id not in subtree_ids:
        logger.warning(
            "mssp.isolation_violation",
            root_tenant_id=str(root_tenant_id),
            target_tenant_id=str(target_tenant_id),
        )
        raise HTTPException(
            status_code=403,
            detail="Access denied: target tenant is outside your hierarchy.",
        )


async def get_hierarchy_depth(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> int:
    """
    Compute actual depth of tenant_id by walking parent_tenant_id chain.

    Returns 0 for root tenants (parent_tenant_id IS NULL).
    Used to validate max_depth=3 before creating a new child.
    """
    depth = 0
    current_id: Optional[uuid.UUID] = tenant_id

    while current_id is not None:
        row = await db.execute(
            select(SoulTenant.parent_tenant_id).where(SoulTenant.id == current_id)
        )
        parent_id = row.scalar_one_or_none()
        if parent_id is None:
            break
        depth += 1
        current_id = parent_id

    return depth


async def validate_depth_for_new_child(
    db: AsyncSession,
    parent_tenant_id: uuid.UUID,
) -> int:
    """
    Return the depth a new child would have under parent_tenant_id.
    Raise ValueError if that depth would exceed MAX_HIERARCHY_DEPTH.

    Returns:
        int: The depth the new child tenant would have (1, 2, or 3).

    Raises:
        ValueError: If creating a child would exceed max_depth=3.
    """
    parent_depth = await get_hierarchy_depth(db, parent_tenant_id)
    new_child_depth = parent_depth + 1

    if new_child_depth > MAX_HIERARCHY_DEPTH:
        raise ValueError(
            f"Cannot create child tenant: would be at depth {new_child_depth}, "
            f"max allowed is {MAX_HIERARCHY_DEPTH}. "
            f"Parent is already at depth {parent_depth}."
        )

    return new_child_depth
