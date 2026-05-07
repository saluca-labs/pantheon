"""check_quarantine — active quarantines from _soulwatch_quarantines."""
from __future__ import annotations

from typing import Any

from ..core.tenant import TenantContext, with_tenant_scope


async def handle(ctx: TenantContext, params: dict[str, Any], *, conn=None) -> dict[str, Any]:
    quarantines: list[dict[str, Any]] = []

    if conn is not None:
        async with with_tenant_scope(conn, ctx) as scoped:
            sql = (
                "SELECT id, created_at, subject_type, subject_id, reason, "
                "severity, expires_at "
                "FROM _soulwatch_quarantines "
                "WHERE (expires_at IS NULL OR expires_at > now()) "
                "AND released_at IS NULL "
                "ORDER BY created_at DESC"
            )
            quarantines = [dict(r) for r in await scoped.fetch(sql)]

    return {
        "tenant_id": str(ctx.tenant_id),
        "active_quarantines": quarantines,
        "count": len(quarantines),
    }
