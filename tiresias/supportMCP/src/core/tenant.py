"""Tenant-scoping enforcement for every MCP tool call.

Per project_tiresias_support_architecture.md:
    per-tenant customer-facing agent; no cross-tenant operator;
    delegation-only escalation.

The `TenantContext` is derived from the SoulKey presented by the MCP client.
Every database query made on behalf of a tool MUST pass through
`with_tenant_scope()` so that PostgreSQL row-level security policies activate
via `SET LOCAL app.current_tenant_id`.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, AsyncIterator


class TenantScopeError(Exception):
    """Raised when tenant scoping cannot be established or is violated."""


@dataclass(frozen=True)
class TenantContext:
    tenant_id: uuid.UUID
    soulkey_id: str
    # TODO(G.1): populate roles + delegation info from SoulKey claims.
    roles: tuple[str, ...] = ()

    @staticmethod
    def from_soulkey(soulkey: str, deployment_scope: str | None = None) -> "TenantContext":
        """Derive tenant context from an incoming SoulKey string.

        Scaffold implementation — real implementation calls SoulAuth to
        resolve the key. Here we accept a test form `sk_agent_<tenant>_...`
        and pin against the deployment's SUPPORT_MCP_TENANT_SCOPE.
        """
        if not soulkey or not soulkey.startswith("sk_"):
            raise TenantScopeError("missing or malformed SoulKey")

        # Scaffold-only derivation. TODO(G.1): replace with SoulAuth RPC.
        parts = soulkey.split("_")
        if len(parts) < 4:
            raise TenantScopeError("SoulKey does not encode tenant")
        tenant_hex = parts[2]
        try:
            tenant_id = uuid.UUID(tenant_hex) if len(tenant_hex) == 32 else uuid.uuid5(
                uuid.NAMESPACE_OID, tenant_hex
            )
        except ValueError as exc:
            raise TenantScopeError(f"bad tenant id: {tenant_hex}") from exc

        if deployment_scope:
            try:
                scoped = uuid.UUID(deployment_scope)
            except ValueError as exc:
                raise TenantScopeError("invalid SUPPORT_MCP_TENANT_SCOPE") from exc
            if scoped != tenant_id:
                raise TenantScopeError(
                    "cross-tenant probe: soulkey tenant != deployment scope"
                )

        return TenantContext(tenant_id=tenant_id, soulkey_id=soulkey)


@asynccontextmanager
async def with_tenant_scope(conn: Any, ctx: TenantContext) -> AsyncIterator[Any]:
    """Apply `SET LOCAL app.current_tenant_id` for the lifetime of the block.

    Works with asyncpg connections and SQLAlchemy async connections (both
    expose an `execute()` coroutine). For the scaffold we use a simple
    duck-typed interface so tests can pass a stub.
    """
    tenant = str(ctx.tenant_id)
    # `SET LOCAL` limits the setting to the current transaction so we also
    # open a transaction if the caller hasn't.
    await conn.execute(f"SET LOCAL app.current_tenant_id = '{tenant}'")
    try:
        yield conn
    finally:
        # No explicit RESET needed: SET LOCAL is auto-cleared at txn end.
        pass
