"""Tenant hierarchy queries for the Tiresias storage layer."""
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

# Postgres CTE uses ::text cast (native UUID columns need explicit cast for comparison)
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

# SQLite CTE (no ::text cast; id/parent stored as TEXT already in test schema)
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


async def get_descendant_tenant_ids(session: AsyncSession, tenant_id: str) -> list[str]:
    """Return caller's tenant + all active descendants via recursive CTE against _soul_tenants.

    Caller's tenant is always the first element. Capped at depth 10 and 100 descendants.
    If the root is not found (inactive or missing), returns [tenant_id] as a safe fallback
    so callers still get RLS-filtered results for at least their own tenant.
    """
    _validate_uuid(tenant_id)

    # Detect dialect to select the appropriate SQL variant
    bind = session.get_bind()
    dialect_name = getattr(bind, "dialect", None)
    if dialect_name is None:
        # For AsyncSession, get the sync engine's dialect name
        try:
            dialect_name = session.bind.dialect.name  # type: ignore[attr-defined]
        except AttributeError:
            dialect_name = "postgresql"

    if isinstance(dialect_name, str):
        use_pg = dialect_name == "postgresql"
    else:
        # It's a dialect object
        use_pg = getattr(dialect_name, "name", "postgresql") == "postgresql"

    cte = _PG_CTE if use_pg else _SQLITE_CTE
    sql = text(cte)
    r = await session.execute(sql, {"root_id": tenant_id, "max_depth": _MAX_DESCENDANT_DEPTH})
    ids = [row[0] for row in r.fetchall()]

    if not ids:
        logger.warning("tenant_hierarchy.root_not_found tenant_id=%s", tenant_id)
        return [tenant_id]

    if len(ids) > _MAX_DESCENDANT_COUNT:
        logger.warning(
            "tenant_hierarchy.cap_exceeded count=%d cap=%d", len(ids), _MAX_DESCENDANT_COUNT
        )
        # Always keep root first; trim descendants to stay within cap
        return [ids[0]] + [i for i in ids[1:] if i != ids[0]][: _MAX_DESCENDANT_COUNT - 1]

    return ids
