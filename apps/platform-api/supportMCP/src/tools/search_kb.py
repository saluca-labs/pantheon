"""search_kb — semantic search over the tenant's KB.

TODO(G.1 CESO-2): decide KB backend (pgvector vs Supabase vs third-party).
Until then this tool returns an empty result set plus a `backend_pending`
marker so the MCP contract is stable.
"""
from __future__ import annotations

from typing import Any

from ..core.tenant import TenantContext


async def handle(ctx: TenantContext, params: dict[str, Any]) -> dict[str, Any]:
    query = params.get("query", "")
    limit = int(params.get("limit", 10))
    sources = params.get("sources") or ["saluca", "tenant_own"]

    # TODO(G.1): call pgvector / Supabase / vendor and enforce
    # `tenant_id = ctx.tenant_id` at the query layer. For now, stub cleanly.
    return {
        "query": query,
        "sources": sources,
        "limit": limit,
        "results": [],
        "backend_pending": True,
        "tenant_id": str(ctx.tenant_id),
    }
