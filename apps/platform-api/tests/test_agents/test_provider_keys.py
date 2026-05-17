"""Wave H.2.e — tests for per-tenant BYOK provider keys.

Coverage:
  * Store: upsert/list/get-by-id/get-by-provider/update/delete + the
    Tiresias-facing :func:`resolve_provider_credentials` helper.
  * HTTP CRUD: tenant scoping (X-Tenant-ID via SOULAUTH_TESTING bypass),
    cross-tenant rejection returns 404 (not 403), secret_ref validation
    at write-time (vault:// → 400, env://NOT_YET_SET → accepted),
    /test endpoint never echoes the resolved secret.
  * build_provider(): backwards-compat (no tenant_id), per-tenant
    override path (tenant_id+row uses the row's secret), graceful
    fallback when the env var is unset.
"""

from __future__ import annotations

import os
import uuid

# Match conftest.py bootstrap — required BEFORE importing src.* so that
# settings load cleanly under SQLite + RBAC bypass.
os.environ.setdefault("SOULAUTH_MODE", "local")
os.environ.setdefault("SOULAUTH_TESTING", "true")
os.environ.setdefault("SOULAUTH_DEBUG", "true")
os.environ.setdefault("ENVIRONMENT", "test")

import asyncio
import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.agents.provider_keys_router import router as pk_router
from src.database.connection import Base
from src.database.models import SoulTenant


TENANT_A = uuid.UUID("11111111-1111-1111-1111-111111111111")
TENANT_B = uuid.UUID("22222222-2222-2222-2222-222222222222")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def engine():
    """Fresh SQLite-in-memory DB per test."""
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def patched_factory(engine, monkeypatch):
    """Point every module-level `async_session_factory` at the test engine.

    The provider keys store does `from src.database.connection import
    async_session_factory` at import time, so we patch both the canonical
    name AND the already-imported alias inside the store module.
    """
    factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(
        "src.database.connection.async_session_factory", factory, raising=False
    )
    monkeypatch.setattr(
        "src.agents.provider_keys_store.async_session_factory",
        factory,
        raising=False,
    )
    yield factory


@pytest_asyncio.fixture
async def tenants(patched_factory):
    """Seed two tenants for cross-tenant isolation checks."""
    async with patched_factory() as s:
        s.add(SoulTenant(
            id=TENANT_A, name="Saluca A", slug="saluca-a",
            tier="enterprise", status="active",
        ))
        s.add(SoulTenant(
            id=TENANT_B, name="Other B", slug="otherb-b",
            tier="enterprise", status="active",
        ))
        await s.commit()


@pytest.fixture
def client(patched_factory, tenants) -> TestClient:
    """Minimal FastAPI app exposing only the provider keys router."""
    app = FastAPI()
    app.include_router(pk_router)
    return TestClient(app)


def hdr_a() -> dict:
    return {"X-Tenant-ID": str(TENANT_A)}


def hdr_b() -> dict:
    return {"X-Tenant-ID": str(TENANT_B)}


# ---------------------------------------------------------------------------
# Store tests
# ---------------------------------------------------------------------------


def test_store_upsert_and_get_by_provider(patched_factory, tenants, monkeypatch):
    """Upsert creates a row; second upsert with same (tenant, provider)
    replaces mutable fields and preserves id."""
    from src.agents.provider_keys_store import (
        upsert_tenant_provider_key,
        get_tenant_provider_key_by_provider,
    )

    monkeypatch.setenv("MY_TEST_ANTHROPIC_KEY", "sk-test-aaa-12345")

    async def _run():
        first = await upsert_tenant_provider_key(
            tenant_id=TENANT_A,
            provider="anthropic",
            secret_ref="env://MY_TEST_ANTHROPIC_KEY",
            base_url=None,
            status="active",
        )
        # Second upsert (same tenant+provider) updates in place
        second = await upsert_tenant_provider_key(
            tenant_id=TENANT_A,
            provider="anthropic",
            secret_ref="env://MY_TEST_ANTHROPIC_KEY",
            base_url="https://my-anthropic-proxy.example.com",
            status="active",
        )
        # IDs match → upsert behavior verified
        assert first.id == second.id
        assert second.base_url == "https://my-anthropic-proxy.example.com"

        # get_by_provider returns the updated row
        fetched = await get_tenant_provider_key_by_provider(TENANT_A, "anthropic")
        assert fetched is not None
        assert fetched.base_url == "https://my-anthropic-proxy.example.com"

    asyncio.run(_run())


def test_resolve_provider_credentials_resolves_active(
    patched_factory, tenants, monkeypatch
):
    """When a row exists, env-resolvable, and active → returns (key, base)."""
    from src.agents.provider_keys_store import (
        upsert_tenant_provider_key,
        resolve_provider_credentials,
    )

    monkeypatch.setenv("TENANT_A_ANTHROPIC", "sk-rooted-in-env")

    async def _run():
        await upsert_tenant_provider_key(
            tenant_id=TENANT_A,
            provider="anthropic",
            secret_ref="env://TENANT_A_ANTHROPIC",
            base_url="https://tenant-a.example.com",
        )
        key, base = await resolve_provider_credentials(TENANT_A, "anthropic")
        assert key == "sk-rooted-in-env"
        assert base == "https://tenant-a.example.com"

    asyncio.run(_run())


def test_resolve_provider_credentials_returns_none_for_missing(
    patched_factory, tenants
):
    """No row → (None, None) → caller falls back to env-default."""
    from src.agents.provider_keys_store import resolve_provider_credentials

    async def _run():
        key, base = await resolve_provider_credentials(TENANT_A, "openai")
        assert key is None
        assert base is None

    asyncio.run(_run())


def test_resolve_provider_credentials_returns_none_for_disabled(
    patched_factory, tenants, monkeypatch
):
    """Disabled row → (None, None) — caller falls back to env-default."""
    from src.agents.provider_keys_store import (
        upsert_tenant_provider_key,
        resolve_provider_credentials,
    )

    monkeypatch.setenv("DISABLED_KEY", "sk-this-should-not-be-returned")

    async def _run():
        await upsert_tenant_provider_key(
            tenant_id=TENANT_A,
            provider="openai",
            secret_ref="env://DISABLED_KEY",
            status="disabled",
        )
        key, base = await resolve_provider_credentials(TENANT_A, "openai")
        assert key is None
        assert base is None

    asyncio.run(_run())


def test_resolve_provider_credentials_returns_none_on_broken_secret_ref(
    patched_factory, tenants, monkeypatch
):
    """env var unset at resolve-time → (None, None), don't crash."""
    from src.agents.provider_keys_store import (
        upsert_tenant_provider_key,
        resolve_provider_credentials,
    )

    monkeypatch.delenv("DEFINITELY_NOT_SET_KEY", raising=False)

    async def _run():
        await upsert_tenant_provider_key(
            tenant_id=TENANT_A,
            provider="groq",
            secret_ref="env://DEFINITELY_NOT_SET_KEY",
        )
        key, base = await resolve_provider_credentials(TENANT_A, "groq")
        assert key is None
        assert base is None

    asyncio.run(_run())


def test_resolve_provider_credentials_tenant_isolation(
    patched_factory, tenants, monkeypatch
):
    """Tenant A's row does NOT bleed into Tenant B's resolution."""
    from src.agents.provider_keys_store import (
        upsert_tenant_provider_key,
        resolve_provider_credentials,
    )

    monkeypatch.setenv("A_KEY", "sk-a-only")

    async def _run():
        await upsert_tenant_provider_key(
            tenant_id=TENANT_A,
            provider="anthropic",
            secret_ref="env://A_KEY",
        )
        a_key, _ = await resolve_provider_credentials(TENANT_A, "anthropic")
        b_key, _ = await resolve_provider_credentials(TENANT_B, "anthropic")
        assert a_key == "sk-a-only"
        assert b_key is None

    asyncio.run(_run())


# ---------------------------------------------------------------------------
# build_provider() integration
# ---------------------------------------------------------------------------


def test_build_provider_no_tenant_uses_env_default(patched_factory, tenants, monkeypatch):
    """tenant_id=None → falls through to env-lookup (pre-W-H.2.e behavior)."""
    from src.tiresias.providers import build_provider

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-env-default-value")
    p = build_provider("anthropic", dict(os.environ))
    assert p._api_key == "sk-env-default-value"


def test_build_provider_with_tenant_id_no_row_falls_back(
    patched_factory, tenants, monkeypatch
):
    """tenant_id set but no row → falls back to env-default (no regression)."""
    from src.tiresias.providers import build_provider

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-env-default-value")
    p = build_provider("anthropic", dict(os.environ), tenant_id=TENANT_A)
    assert p._api_key == "sk-env-default-value"


def test_build_provider_with_tenant_row_uses_tenant_key(
    patched_factory, tenants, monkeypatch
):
    """When a per-tenant row exists, build_provider uses it over the env-default."""
    from src.agents.provider_keys_store import upsert_tenant_provider_key
    from src.tiresias.providers import build_provider

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-env-default-value")
    monkeypatch.setenv("TENANT_OVERRIDE_KEY", "sk-tenant-override-value")

    asyncio.run(upsert_tenant_provider_key(
        tenant_id=TENANT_A,
        provider="anthropic",
        secret_ref="env://TENANT_OVERRIDE_KEY",
        base_url="https://my-anthropic.example.com",
    ))

    p = build_provider("anthropic", dict(os.environ), tenant_id=TENANT_A)
    assert p._api_key == "sk-tenant-override-value"
    assert p.api_base == "https://my-anthropic.example.com"


def test_build_provider_explicit_api_base_wins(
    patched_factory, tenants, monkeypatch
):
    """An explicit api_base argument wins over both tenant override and env."""
    from src.agents.provider_keys_store import upsert_tenant_provider_key
    from src.tiresias.providers import build_provider

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-env-default")
    monkeypatch.setenv("TENANT_KEY", "sk-tenant")

    asyncio.run(upsert_tenant_provider_key(
        tenant_id=TENANT_A,
        provider="anthropic",
        secret_ref="env://TENANT_KEY",
        base_url="https://tenant.example.com",
    ))

    p = build_provider(
        "anthropic",
        dict(os.environ),
        api_base="https://explicit.example.com",
        tenant_id=TENANT_A,
    )
    # Key comes from tenant override
    assert p._api_key == "sk-tenant"
    # Explicit api_base wins
    assert p.api_base == "https://explicit.example.com"


# ---------------------------------------------------------------------------
# HTTP CRUD — create / list / get / patch / delete
# ---------------------------------------------------------------------------


def test_create_provider_key_forces_caller_tenant(client, monkeypatch):
    monkeypatch.setenv("MY_KEY", "sk-real-value-XXXXXX")
    resp = client.post(
        "/v1/provider-keys",
        json={
            "provider": "anthropic",
            "secret_ref": "env://MY_KEY",
            "base_url": "https://api.example.com",
        },
        headers=hdr_a(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tenant_id"] == str(TENANT_A)
    assert body["provider"] == "anthropic"
    assert body["secret_ref"] == "env://MY_KEY"
    # The resolved secret must NEVER appear in the response
    assert "sk-real-value-XXXXXX" not in resp.text


def test_create_provider_key_with_env_not_set_is_accepted(client, monkeypatch):
    """env://NOT_YET_SET is accepted — operator may set the var later.
    The CRUD layer defers resolution; /test will report failure."""
    monkeypatch.delenv("NOT_YET_SET", raising=False)
    resp = client.post(
        "/v1/provider-keys",
        json={"provider": "openai", "secret_ref": "env://NOT_YET_SET"},
        headers=hdr_a(),
    )
    assert resp.status_code == 200, resp.text


def test_create_provider_key_with_unsupported_scheme_rejected(client):
    """vault:// is a reserved-but-unimplemented scheme → 400."""
    resp = client.post(
        "/v1/provider-keys",
        json={
            "provider": "anthropic",
            "secret_ref": "vault://kv/data/anthropic#key",
        },
        headers=hdr_a(),
    )
    assert resp.status_code == 400
    assert "unsupported" in resp.text.lower() or "scheme" in resp.text.lower()


def test_create_provider_key_unknown_provider_rejected(client, monkeypatch):
    monkeypatch.setenv("ANYKEY", "x")
    resp = client.post(
        "/v1/provider-keys",
        json={"provider": "totally-not-a-real-provider", "secret_ref": "env://ANYKEY"},
        headers=hdr_a(),
    )
    assert resp.status_code == 400


def test_create_provider_key_upserts_on_duplicate(client, monkeypatch):
    """Same (tenant, provider) creates once, updates on second call."""
    monkeypatch.setenv("K", "v")
    r1 = client.post(
        "/v1/provider-keys",
        json={"provider": "groq", "secret_ref": "env://K"},
        headers=hdr_a(),
    )
    r2 = client.post(
        "/v1/provider-keys",
        json={
            "provider": "groq",
            "secret_ref": "env://K",
            "base_url": "https://new.example.com",
        },
        headers=hdr_a(),
    )
    assert r1.status_code == 200 and r2.status_code == 200
    # Same id, new base_url
    assert r1.json()["id"] == r2.json()["id"]
    assert r2.json()["base_url"] == "https://new.example.com"


def test_list_provider_keys_filters_by_tenant(client, monkeypatch):
    """Tenant A's GET should NOT include Tenant B's rows."""
    monkeypatch.setenv("A_KEY", "v"); monkeypatch.setenv("B_KEY", "v")
    client.post(
        "/v1/provider-keys",
        json={"provider": "anthropic", "secret_ref": "env://A_KEY"},
        headers=hdr_a(),
    )
    client.post(
        "/v1/provider-keys",
        json={"provider": "openai", "secret_ref": "env://B_KEY"},
        headers=hdr_b(),
    )
    list_a = client.get("/v1/provider-keys", headers=hdr_a()).json()
    list_b = client.get("/v1/provider-keys", headers=hdr_b()).json()
    assert {r["provider"] for r in list_a} == {"anthropic"}
    assert {r["provider"] for r in list_b} == {"openai"}


def test_get_provider_key_cross_tenant_returns_404(client, monkeypatch):
    """Cross-tenant GET → 404 (not 403, don't leak existence)."""
    monkeypatch.setenv("MYKEY", "v")
    created = client.post(
        "/v1/provider-keys",
        json={"provider": "anthropic", "secret_ref": "env://MYKEY"},
        headers=hdr_a(),
    ).json()
    resp = client.get(f"/v1/provider-keys/{created['id']}", headers=hdr_b())
    assert resp.status_code == 404


def test_patch_provider_key_cross_tenant_returns_404(client, monkeypatch):
    monkeypatch.setenv("MYKEY", "v")
    created = client.post(
        "/v1/provider-keys",
        json={"provider": "anthropic", "secret_ref": "env://MYKEY"},
        headers=hdr_a(),
    ).json()
    resp = client.patch(
        f"/v1/provider-keys/{created['id']}",
        json={"status": "disabled"},
        headers=hdr_b(),
    )
    assert resp.status_code == 404


def test_patch_provider_key_own_tenant_succeeds(client, monkeypatch):
    monkeypatch.setenv("MYKEY", "v")
    created = client.post(
        "/v1/provider-keys",
        json={"provider": "anthropic", "secret_ref": "env://MYKEY"},
        headers=hdr_a(),
    ).json()
    resp = client.patch(
        f"/v1/provider-keys/{created['id']}",
        json={"status": "disabled", "base_url": "https://changed.example.com"},
        headers=hdr_a(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "disabled"
    assert body["base_url"] == "https://changed.example.com"


def test_delete_provider_key_cross_tenant_returns_404(client, monkeypatch):
    monkeypatch.setenv("MYKEY", "v")
    created = client.post(
        "/v1/provider-keys",
        json={"provider": "anthropic", "secret_ref": "env://MYKEY"},
        headers=hdr_a(),
    ).json()
    resp = client.delete(f"/v1/provider-keys/{created['id']}", headers=hdr_b())
    assert resp.status_code == 404


def test_delete_provider_key_own_tenant_succeeds(client, monkeypatch):
    monkeypatch.setenv("MYKEY", "v")
    created = client.post(
        "/v1/provider-keys",
        json={"provider": "anthropic", "secret_ref": "env://MYKEY"},
        headers=hdr_a(),
    ).json()
    resp = client.delete(f"/v1/provider-keys/{created['id']}", headers=hdr_a())
    assert resp.status_code == 200
    # Subsequent GET → 404
    g = client.get(f"/v1/provider-keys/{created['id']}", headers=hdr_a())
    assert g.status_code == 404


# ---------------------------------------------------------------------------
# /test endpoint
# ---------------------------------------------------------------------------


def test_test_endpoint_reports_failure_when_env_unset(client, monkeypatch):
    """env://NOT_SET — created OK, but /test returns ok=false."""
    monkeypatch.delenv("WILL_NOT_BE_SET", raising=False)
    created = client.post(
        "/v1/provider-keys",
        json={"provider": "anthropic", "secret_ref": "env://WILL_NOT_BE_SET"},
        headers=hdr_a(),
    ).json()
    resp = client.post(
        f"/v1/provider-keys/{created['id']}/test", headers=hdr_a()
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "resolution failed" in (body.get("error") or "").lower()


def test_test_endpoint_never_echoes_resolved_secret(client, monkeypatch):
    """The /test response must not contain the raw secret in any field."""
    monkeypatch.setenv("SUPERSECRET_KEY", "sk-NEVER-ECHO-XYZ-12345")
    created = client.post(
        "/v1/provider-keys",
        json={"provider": "anthropic", "secret_ref": "env://SUPERSECRET_KEY"},
        headers=hdr_a(),
    ).json()
    # The /test will fail (no network in unit test, or 401 from anthropic),
    # but the response body must NOT include the resolved secret.
    resp = client.post(
        f"/v1/provider-keys/{created['id']}/test", headers=hdr_a()
    )
    assert "sk-NEVER-ECHO-XYZ-12345" not in resp.text


def test_test_endpoint_cross_tenant_returns_404(client, monkeypatch):
    monkeypatch.setenv("MYKEY", "v")
    created = client.post(
        "/v1/provider-keys",
        json={"provider": "anthropic", "secret_ref": "env://MYKEY"},
        headers=hdr_a(),
    ).json()
    resp = client.post(
        f"/v1/provider-keys/{created['id']}/test", headers=hdr_b()
    )
    assert resp.status_code == 404


def test_inline_test_endpoint_unsupported_scheme_returns_failure(client):
    """Inline /test of a vault:// secret_ref returns ok=false (not 400 —
    the inline endpoint reports failures inline so the modal UI can
    show them without a status-code branch)."""
    resp = client.post(
        "/v1/provider-keys/test",
        json={"provider": "anthropic", "secret_ref": "vault://something"},
        headers=hdr_a(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "resolution failed" in (body.get("error") or "").lower()
