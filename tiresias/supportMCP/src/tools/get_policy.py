"""get_policy — current soulgate policies applicable to tenant/soulkey/model."""
from __future__ import annotations

from typing import Any

from ..core.tenant import TenantContext, with_tenant_scope


async def handle(ctx: TenantContext, params: dict[str, Any], *, conn=None) -> dict[str, Any]:
    soulkey_id = params.get("soulkey_id")
    model = params.get("model")
    policies: list[dict[str, Any]] = []

    if conn is not None:
        async with with_tenant_scope(conn, ctx) as scoped:
            sql = (
                "SELECT id, name, version, scope, rules, active "
                "FROM soulgate_policies "
                "WHERE active = true "
                "AND ($1::text IS NULL OR scope ? $1) "
                "AND ($2::text IS NULL OR scope ? $2)"
            )
            policies = [dict(r) for r in await scoped.fetch(sql, soulkey_id, model)]

    return {
        "tenant_id": str(ctx.tenant_id),
        "soulkey_id": soulkey_id,
        "model": model,
        "policies": policies,
    }
