"""get_usage — current-period usage from tiresias_usage_buckets.

Tier 5 dependency. If the table is empty or missing, return a stub response
rather than 500 so the MCP surface stays stable during scaffolding.
"""
from __future__ import annotations

from typing import Any

from ..core.tenant import TenantContext, with_tenant_scope


async def handle(ctx: TenantContext, params: dict[str, Any], *, conn=None) -> dict[str, Any]:
    period = params.get("period", "current")
    buckets: list[dict[str, Any]] = []
    stub = True

    if conn is not None:
        try:
            async with with_tenant_scope(conn, ctx) as scoped:
                sql = (
                    "SELECT bucket_key, metric, value, period_start, period_end "
                    "FROM tiresias_usage_buckets "
                    "WHERE ($1 = 'current' AND period_end > now()) "
                    "OR ($1 <> 'current' AND bucket_key = $1)"
                )
                rows = await scoped.fetch(sql, period)
                buckets = [dict(r) for r in rows]
                stub = False
        except Exception:  # pragma: no cover — table may not exist yet
            stub = True

    return {
        "tenant_id": str(ctx.tenant_id),
        "period": period,
        "buckets": buckets,
        "stub": stub,
    }
