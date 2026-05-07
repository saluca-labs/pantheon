import uuid

import pytest

from supportMCP.src.core.tenant import (
    TenantContext,
    TenantScopeError,
    with_tenant_scope,
)


def _sk(tenant_uuid: uuid.UUID) -> str:
    return f"sk_agent_{tenant_uuid.hex}_abc_deadbeef"


def test_from_soulkey_derives_tenant():
    t = uuid.uuid4()
    ctx = TenantContext.from_soulkey(_sk(t))
    assert ctx.tenant_id == t


def test_from_soulkey_rejects_missing():
    with pytest.raises(TenantScopeError):
        TenantContext.from_soulkey("")


def test_from_soulkey_rejects_malformed():
    with pytest.raises(TenantScopeError):
        TenantContext.from_soulkey("sk_agent")


def test_deployment_scope_blocks_cross_tenant():
    t1 = uuid.uuid4()
    t2 = uuid.uuid4()
    with pytest.raises(TenantScopeError):
        TenantContext.from_soulkey(_sk(t1), deployment_scope=str(t2))


def test_deployment_scope_allows_matching_tenant():
    t = uuid.uuid4()
    ctx = TenantContext.from_soulkey(_sk(t), deployment_scope=str(t))
    assert ctx.tenant_id == t


class _StubConn:
    def __init__(self):
        self.executed: list[str] = []

    async def execute(self, sql: str, *args):
        self.executed.append(sql)


@pytest.mark.asyncio
async def test_with_tenant_scope_sets_local():
    t = uuid.uuid4()
    ctx = TenantContext(tenant_id=t, soulkey_id="sk_test")
    conn = _StubConn()
    async with with_tenant_scope(conn, ctx):
        pass
    assert any("SET LOCAL app.current_tenant_id" in s for s in conn.executed)
    assert str(t) in conn.executed[0]
