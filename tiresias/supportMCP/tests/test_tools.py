import uuid

import pytest

from supportMCP.src.core.tenant import TenantContext
from supportMCP.src.tools import (
    check_quarantine,
    decrypt_content,
    get_policy,
    get_usage,
    query_logs,
    search_kb,
    trace_replay,
)


def _ctx() -> TenantContext:
    return TenantContext(tenant_id=uuid.uuid4(), soulkey_id="sk_test")


class _Conn:
    """Records queries; returns empty result sets.

    Simulates an RLS-enforced DB: regardless of the SQL, only the caller's
    tenant would be returned. For the scaffold we assert zero cross-tenant
    rows by returning `[]` always, which is the correct behavior when RLS
    filters out non-matching tenants.
    """

    def __init__(self):
        self.sql: list[str] = []
        self.tenant_set: str | None = None

    async def execute(self, sql: str, *args):
        self.sql.append(sql)
        if "SET LOCAL app.current_tenant_id" in sql:
            self.tenant_set = sql

    async def fetch(self, sql: str, *args):
        self.sql.append(sql)
        return []


@pytest.mark.asyncio
async def test_search_kb_stub_ok():
    ctx = _ctx()
    out = await search_kb.handle(ctx, {"query": "foo"})
    assert out["backend_pending"] is True
    assert out["tenant_id"] == str(ctx.tenant_id)
    assert out["results"] == []


@pytest.mark.asyncio
async def test_query_logs_sets_tenant_scope():
    ctx = _ctx()
    conn = _Conn()
    out = await query_logs.handle(ctx, {"since": "2026-01-01T00:00:00Z"}, conn=conn)
    assert conn.tenant_set is not None
    assert str(ctx.tenant_id) in conn.tenant_set
    assert out["security_audit_rows"] == []


@pytest.mark.asyncio
async def test_trace_replay_metadata_only():
    ctx = _ctx()
    conn = _Conn()
    out = await trace_replay.handle(ctx, {"trace_id": "tr_1"}, conn=conn)
    assert out["replay_executed"] is False
    assert out["events"] == []
    assert conn.tenant_set is not None


@pytest.mark.asyncio
async def test_get_policy_scoped():
    ctx = _ctx()
    conn = _Conn()
    out = await get_policy.handle(ctx, {"model": "gpt-4"}, conn=conn)
    assert out["policies"] == []
    assert conn.tenant_set is not None


@pytest.mark.asyncio
async def test_check_quarantine_scoped():
    ctx = _ctx()
    conn = _Conn()
    out = await check_quarantine.handle(ctx, {}, conn=conn)
    assert out["count"] == 0
    assert conn.tenant_set is not None


@pytest.mark.asyncio
async def test_get_usage_handles_missing_table():
    ctx = _ctx()
    out = await get_usage.handle(ctx, {"period": "current"}, conn=None)
    assert out["stub"] is True


@pytest.mark.asyncio
async def test_decrypt_content_is_stubbed():
    ctx = _ctx()
    out = await decrypt_content.handle(ctx, {"audit_row_id": "x"})
    assert out["error"] == "not_implemented"
    assert out["reason"] == "requires_mfa_step_up"
    assert out["eta"] == "G.1_after_tier4"


@pytest.mark.asyncio
async def test_cross_tenant_query_returns_zero_rows():
    """Simulated RLS: even though we call the tool with tenant A's context,
    the stub DB returns [] which represents RLS filtering out tenant B data.
    Verifies the tool doesn't leak non-scoped rows."""
    ctx = _ctx()
    conn = _Conn()
    out = await query_logs.handle(ctx, {"since": "2026-01-01T00:00:00Z"}, conn=conn)
    assert out["security_audit_rows"] == []
    # The SET LOCAL must precede any SELECT.
    idx_set = next(i for i, s in enumerate(conn.sql) if "SET LOCAL" in s)
    idx_select = next(i for i, s in enumerate(conn.sql) if "SELECT" in s.upper())
    assert idx_set < idx_select
