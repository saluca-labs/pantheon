"""Tenant hierarchy queries for SoulWatch.

Replicates the recursive CTE pattern from tiresias-proxy
src/tiresias/storage/tenants.py — kept separate (different service,
no shared import). Controlled by SOULWATCH_TENANT_HIERARCHY_MODE.
"""

from __future__ import annotations

import logging
import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
_MAX_DESCENDANT_DEPTH = 10
_MAX_DESCENDANT_COUNT = 100

# PostgreSQL variant — explicit ::text cast for UUID columns
_PG_CTE = """
    WITH RECURSIVE tenant_tree AS (
        SELECT id::text AS id, parent_tenant_id::text AS parent_tenant_id, 0 AS depth
        FROM _soul_tenants
        WHERE id::text = :root_id AND status = 'active'
        UNION ALL
        SELECT t.id::text, t.parent_tenant_id::text, tt.depth + 1
        FROM _soul_tenants t
        JOIN tenant_tree tt ON t.parent_tenant_id::text = tt.id
        WHERE t.status = 'active' AND tt.depth < :max_depth
    )
    SELECT id FROM tenant_tree ORDER BY depth ASC, id ASC
"""

# SQLite variant — id/parent stored as TEXT in test schema, no cast needed
_SQLITE_CTE = """
    WITH RECURSIVE tenant_tree AS (
        SELECT id AS id, parent_tenant_id AS parent_tenant_id, 0 AS depth
        FROM _soul_tenants
        WHERE id = :root_id AND status = 'active'
        UNION ALL
        SELECT t.id, t.parent_tenant_id, tt.depth + 1
        FROM _soul_tenants t
        JOIN tenant_tree tt ON t.parent_tenant_id = tt.id
        WHERE t.status = 'active' AND tt.depth < :max_depth
    )
    SELECT id FROM tenant_tree ORDER BY depth ASC, id ASC
"""


def _validate_uuid(v: str) -> str:
    if not _UUID_RE.fullmatch(v):
        raise ValueError(f"Invalid UUID: {v!r}")
    return v


def _is_postgres(session: AsyncSession) -> bool:
    """Detect whether the session is backed by PostgreSQL."""
    try:
        bind = session.get_bind()
        dialect = getattr(bind, "dialect", None)
        if dialect is None:
            dialect = session.bind.dialect  # type: ignore[attr-defined]
        name = getattr(dialect, "name", "postgresql")
        return name == "postgresql"
    except AttributeError:
        return True  # safe default — production is always PG


async def get_descendant_tenant_ids(
    session: AsyncSession,
    tenant_id: str,
) -> list[str]:
    """Return caller's tenant + all active descendants via recursive CTE.

    The root tenant is always the first element.  Capped at depth 10 and
    100 total descendants.  If the root is inactive / missing, returns
    [tenant_id] as a safe single-tenant fallback so callers still get
    RLS-filtered results for their own tenant.
    """
    _validate_uuid(tenant_id)

    cte = _PG_CTE if _is_postgres(session) else _SQLITE_CTE
    result = await session.execute(
        text(cte),
        {"root_id": tenant_id, "max_depth": _MAX_DESCENDANT_DEPTH},
    )
    ids: list[str] = [row[0] for row in result.fetchall()]

    if not ids:
        logger.warning(
            "soulwatch.tenant_hierarchy.root_not_found tenant_id=%s", tenant_id
        )
        return [tenant_id]

    if len(ids) > _MAX_DESCENDANT_COUNT:
        logger.warning(
            "soulwatch.tenant_hierarchy.cap_exceeded count=%d cap=%d",
            len(ids),
            _MAX_DESCENDANT_COUNT,
        )
        root = ids[0]
        rest = [i for i in ids[1:] if i != root][: _MAX_DESCENDANT_COUNT - 1]
        return [root] + rest

    return ids
