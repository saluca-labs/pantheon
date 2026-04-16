"""query_logs — tenant-scoped Cloud Logging + _security_audit query.

RLS is enforced at the DB layer (`SET LOCAL app.current_tenant_id`). The
Cloud Logging path uses the same tenant_id as a mandatory filter clause.

Column alignment (verified against migration 0030):
  - `outcome` (success|failure|blocked) replaces scaffold's `level`
  - `service` (source system name) replaces scaffold's `source`
"""
from __future__ import annotations

from typing import Any

from ..core.tenant import TenantContext, with_tenant_scope


async def handle(ctx: TenantContext, params: dict[str, Any], *, conn=None, gcl_client=None) -> dict[str, Any]:
    since = params.get("since")
    until = params.get("until")
    outcome = params.get("outcome")
    event_type = params.get("event_type")
    service = params.get("service")
    limit = int(params.get("limit", 100))

    rows: list[dict[str, Any]] = []

    if conn is not None:
        async with with_tenant_scope(conn, ctx) as scoped:
            # RLS will filter by tenant_id automatically.
            sql = (
                "SELECT id, ts, outcome, event_type, service, payload "
                "FROM _security_audit "
                "WHERE ts >= $1 "
                "AND ($2::timestamptz IS NULL OR ts <= $2) "
                "AND ($3::text IS NULL OR outcome = $3) "
                "AND ($4::text IS NULL OR event_type = $4) "
                "AND ($5::text IS NULL OR service = $5) "
                "ORDER BY ts DESC LIMIT $6"
            )
            rows = await scoped.fetch(sql, since, until, outcome, event_type, service, limit)

    gcl_entries: list[dict[str, Any]] = []
    if gcl_client is not None:
        # GCL filter MUST include tenant_id label.
        gcl_filter = f'labels.tenant_id="{ctx.tenant_id}"'
        # GCL severity ~ aligns conceptually with audit outcome; callers that
        # want GCL-side severity filtering pass it via the `outcome` param.
        if outcome:
            gcl_filter += f' AND severity="{outcome}"'
        gcl_entries = await gcl_client.list(filter_=gcl_filter, limit=limit)

    return {
        "tenant_id": str(ctx.tenant_id),
        "security_audit_rows": [dict(r) for r in rows],
        "cloud_logging_entries": gcl_entries,
        "limit": limit,
    }
