"""Wave H.2.c — tests for the Agent + Prompt CRUD HTTP surface.

Exercises ``/v1/agents/*`` and ``/v1/prompts/*`` against the LocalPg
store backend through a minimal FastAPI app. Auth/RBAC is bypassed via
the standard ``SOULAUTH_TESTING=true`` short-circuit in
:func:`src.auth.rbac.require_permission`; the mock soulkey's tenant_id
is taken from the ``X-Tenant-ID`` request header, which is how we
exercise per-tenant scoping (each test sends the header for the tenant
whose data it's acting as).

Tenant scoping coverage:
  * POST /v1/agents forces caller's tenant_id onto the row
  * GET  /v1/agents includes globals iff include_global=True
  * GET  /v1/agents/{id} returns 404 (NOT 403) for another tenant's row
  * PATCH/DELETE reject cross-tenant access with 404
  * Globals are read-only via these endpoints (403 on patch/delete)
  * Prompt resolve: tenant row wins over global row
  * Prompt version append produces a supersession chain (old=deprecated,
    new=active, new.supersedes_id = old.id, version=old.version+1)
"""

from __future__ import annotations

import os
import uuid

# Match the conftest.py bootstrap — required BEFORE importing src.* so that
# settings load cleanly under SQLite + RBAC bypass.
os.environ.setdefault("SOULAUTH_MODE", "local")
os.environ.setdefault("SOULAUTH_TESTING", "true")
os.environ.setdefault("SOULAUTH_DEBUG", "true")
os.environ.setdefault("ENVIRONMENT", "test")

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

from src.agents.crud_router import router as crud_router
from src.database.connection import Base
from src.database.models import SoulTenant


TENANT_A = uuid.UUID("11111111-1111-1111-1111-111111111111")
TENANT_B = uuid.UUID("22222222-2222-2222-2222-222222222222")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def engine():
    """Fresh SQLite-in-memory database per test (full isolation)."""
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

    Both the CRUD router and the LocalPg store reach for the canonical
    `src.database.connection.async_session_factory`; we additionally patch
    the already-imported aliases inside each module (modules that did
    `from src.database.connection import async_session_factory` hold their
    own binding).
    """
    factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(
        "src.database.connection.async_session_factory", factory, raising=False
    )
    monkeypatch.setattr(
        "src.agents.local_pg_store.async_session_factory", factory, raising=False
    )
    monkeypatch.setattr(
        "src.agents.config.async_session_factory", factory, raising=False
    )
    yield factory


@pytest_asyncio.fixture
async def tenants(patched_factory):
    """Seed two tenants — we need both so that we can prove cross-tenant
    rejection by issuing requests as TENANT_B against rows owned by
    TENANT_A.
    """
    async with patched_factory() as s:
        s.add(SoulTenant(
            id=TENANT_A, name="Saluca A", slug="saluca",
            tier="enterprise", status="active",
        ))
        s.add(SoulTenant(
            id=TENANT_B, name="Other B", slug="otherb",
            tier="enterprise", status="active",
        ))
        await s.commit()


@pytest.fixture
def client(patched_factory, tenants) -> TestClient:
    """Minimal FastAPI app exposing only the CRUD router."""
    app = FastAPI()
    app.include_router(crud_router)
    return TestClient(app)


def hdr_a() -> dict:
    """Tenant A's caller identity (via the SOULAUTH_TESTING bypass)."""
    return {"X-Tenant-ID": str(TENANT_A)}


def hdr_b() -> dict:
    """Tenant B's caller identity."""
    return {"X-Tenant-ID": str(TENANT_B)}


# ---------------------------------------------------------------------------
# /v1/agents — POST create
# ---------------------------------------------------------------------------


def test_create_agent_forces_caller_tenant_id(client):
    resp = client.post(
        "/v1/agents",
        json={
            "persona_id": "alfred",
            "name": "Alfred",
            "description": "Orchestrator",
            "metadata": {"role": "orchestrator"},
        },
        headers=hdr_a(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["persona_id"] == "alfred"
    assert body["tenant_id"] == str(TENANT_A)
    assert body["status"] == "active"
    assert body["metadata"] == {"role": "orchestrator"}


def test_create_agent_duplicate_persona_returns_409(client):
    client.post(
        "/v1/agents",
        json={"persona_id": "dup", "name": "Dup"},
        headers=hdr_a(),
    )
    resp = client.post(
        "/v1/agents",
        json={"persona_id": "dup", "name": "Dup 2"},
        headers=hdr_a(),
    )
    assert resp.status_code == 409


def test_create_agent_same_persona_different_tenants_allowed(client):
    """Same persona_id can exist under two different tenants."""
    r1 = client.post(
        "/v1/agents",
        json={"persona_id": "shared", "name": "A-version"},
        headers=hdr_a(),
    )
    r2 = client.post(
        "/v1/agents",
        json={"persona_id": "shared", "name": "B-version"},
        headers=hdr_b(),
    )
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["tenant_id"] == str(TENANT_A)
    assert r2.json()["tenant_id"] == str(TENANT_B)


# ---------------------------------------------------------------------------
# /v1/agents — GET list
# ---------------------------------------------------------------------------


def test_list_agents_includes_globals_by_default(client, patched_factory):
    # Seed: one tenant-A row, one global row, one tenant-B row
    import asyncio
    from src.agents.local_pg_store import LocalPgAgentStore
    from src.agents.store import Agent

    store = LocalPgAgentStore()
    asyncio.run(store.create_agent(Agent(
        id=uuid.uuid4(), tenant_id=TENANT_A, persona_id="t-a",
        name="t-a", description=None, prompt_id=None,
    )))
    asyncio.run(store.create_agent(Agent(
        id=uuid.uuid4(), tenant_id=None, persona_id="g-1",
        name="global", description=None, prompt_id=None,
    )))
    asyncio.run(store.create_agent(Agent(
        id=uuid.uuid4(), tenant_id=TENANT_B, persona_id="t-b",
        name="t-b", description=None, prompt_id=None,
    )))

    resp = client.get("/v1/agents", headers=hdr_a())
    assert resp.status_code == 200, resp.text
    personas = sorted(a["persona_id"] for a in resp.json())
    assert personas == ["g-1", "t-a"]


def test_list_agents_excludes_globals_when_false(client):
    import asyncio
    from src.agents.local_pg_store import LocalPgAgentStore
    from src.agents.store import Agent

    store = LocalPgAgentStore()
    asyncio.run(store.create_agent(Agent(
        id=uuid.uuid4(), tenant_id=TENANT_A, persona_id="t-a",
        name="t-a", description=None, prompt_id=None,
    )))
    asyncio.run(store.create_agent(Agent(
        id=uuid.uuid4(), tenant_id=None, persona_id="g-1",
        name="global", description=None, prompt_id=None,
    )))

    resp = client.get("/v1/agents?include_global=false", headers=hdr_a())
    assert resp.status_code == 200
    personas = [a["persona_id"] for a in resp.json()]
    assert personas == ["t-a"]


# ---------------------------------------------------------------------------
# /v1/agents/{id} — GET tenant scoping
# ---------------------------------------------------------------------------


def test_get_agent_own_tenant_succeeds(client):
    created = client.post(
        "/v1/agents",
        json={"persona_id": "own", "name": "Own"},
        headers=hdr_a(),
    ).json()
    resp = client.get(f"/v1/agents/{created['id']}", headers=hdr_a())
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_agent_global_visible_to_any_tenant(client):
    import asyncio
    from src.agents.local_pg_store import LocalPgAgentStore
    from src.agents.store import Agent

    store = LocalPgAgentStore()
    gid = uuid.uuid4()
    asyncio.run(store.create_agent(Agent(
        id=gid, tenant_id=None, persona_id="g-shared",
        name="global", description=None, prompt_id=None,
    )))

    # Tenant A sees it
    r_a = client.get(f"/v1/agents/{gid}", headers=hdr_a())
    assert r_a.status_code == 200
    # Tenant B sees it too
    r_b = client.get(f"/v1/agents/{gid}", headers=hdr_b())
    assert r_b.status_code == 200


def test_get_agent_other_tenant_returns_404_not_403(client):
    """Cross-tenant existence must NOT leak — always 404."""
    created = client.post(
        "/v1/agents",
        json={"persona_id": "secret", "name": "Secret"},
        headers=hdr_a(),
    ).json()
    resp = client.get(f"/v1/agents/{created['id']}", headers=hdr_b())
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /v1/agents/{id} — PATCH
# ---------------------------------------------------------------------------


def test_patch_agent_happy_path(client):
    created = client.post(
        "/v1/agents",
        json={"persona_id": "p1", "name": "Original"},
        headers=hdr_a(),
    ).json()
    resp = client.patch(
        f"/v1/agents/{created['id']}",
        json={"name": "Renamed", "description": "Updated description"},
        headers=hdr_a(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Renamed"
    assert body["description"] == "Updated description"


def test_patch_agent_cross_tenant_rejected(client):
    created = client.post(
        "/v1/agents",
        json={"persona_id": "p1", "name": "A"},
        headers=hdr_a(),
    ).json()
    resp = client.patch(
        f"/v1/agents/{created['id']}",
        json={"name": "B-pwned"},
        headers=hdr_b(),
    )
    assert resp.status_code == 404


def test_patch_global_agent_forbidden(client):
    """Globals are read-only via the tenant CRUD surface."""
    import asyncio
    from src.agents.local_pg_store import LocalPgAgentStore
    from src.agents.store import Agent

    store = LocalPgAgentStore()
    gid = uuid.uuid4()
    asyncio.run(store.create_agent(Agent(
        id=gid, tenant_id=None, persona_id="g",
        name="global", description=None, prompt_id=None,
    )))
    resp = client.patch(
        f"/v1/agents/{gid}",
        json={"name": "trying"},
        headers=hdr_a(),
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# /v1/agents/{id} — DELETE
# ---------------------------------------------------------------------------


def test_delete_agent_soft_deletes_via_status(client):
    created = client.post(
        "/v1/agents",
        json={"persona_id": "to-archive", "name": "X"},
        headers=hdr_a(),
    ).json()
    resp = client.delete(f"/v1/agents/{created['id']}", headers=hdr_a())
    assert resp.status_code == 200
    assert resp.json()["status"] == "archived"
    # Row still exists (soft delete) — confirm by re-fetching.
    again = client.get(f"/v1/agents/{created['id']}", headers=hdr_a())
    assert again.status_code == 200
    assert again.json()["status"] == "archived"


def test_delete_agent_cross_tenant_rejected(client):
    created = client.post(
        "/v1/agents",
        json={"persona_id": "x", "name": "X"},
        headers=hdr_a(),
    ).json()
    resp = client.delete(f"/v1/agents/{created['id']}", headers=hdr_b())
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /v1/prompts — create + version append
# ---------------------------------------------------------------------------


def test_create_prompt_forces_caller_tenant_and_defaults_to_draft(client):
    resp = client.post(
        "/v1/prompts",
        json={"name": "research-coach", "body": "be helpful"},
        headers=hdr_a(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tenant_id"] == str(TENANT_A)
    assert body["version"] == 1
    assert body["status"] == "draft"
    assert body["supersedes_id"] is None


def test_create_prompt_version_supersedes_predecessor(client):
    v1 = client.post(
        "/v1/prompts",
        json={"name": "p", "body": "v1 body", "status": "active"},
        headers=hdr_a(),
    ).json()

    v2_resp = client.post(
        f"/v1/prompts/{v1['id']}/versions",
        json={"body": "v2 body"},
        headers=hdr_a(),
    )
    assert v2_resp.status_code == 200
    v2 = v2_resp.json()
    assert v2["version"] == 2
    assert v2["supersedes_id"] == v1["id"]
    assert v2["status"] == "active"
    assert v2["body"] == "v2 body"
    assert v2["name"] == "p"  # name preserved across versions

    # v1 should be deprecated now.
    re_v1 = client.get(f"/v1/prompts/{v1['id']}", headers=hdr_a()).json()
    assert re_v1["status"] == "deprecated"


def test_create_prompt_version_cross_tenant_rejected(client):
    v1 = client.post(
        "/v1/prompts",
        json={"name": "p", "body": "v1", "status": "active"},
        headers=hdr_a(),
    ).json()
    resp = client.post(
        f"/v1/prompts/{v1['id']}/versions",
        json={"body": "evil"},
        headers=hdr_b(),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /v1/prompts — resolve
# ---------------------------------------------------------------------------


def test_resolve_prompt_tenant_row_beats_global(client):
    import asyncio
    from src.agents.local_pg_store import LocalPgPromptStore
    from src.agents.store import Prompt

    store = LocalPgPromptStore()
    # Seed a global active prompt named "shared"
    asyncio.run(store.create_prompt(Prompt(
        id=uuid.uuid4(), tenant_id=None, name="shared",
        body="global body", status="active",
    )))

    # With only the global, tenant A resolves to it.
    r_global = client.get("/v1/prompts/resolve?name=shared", headers=hdr_a())
    assert r_global.status_code == 200
    assert r_global.json()["body"] == "global body"
    assert r_global.json()["tenant_id"] is None

    # Add a tenant-owned active row with the same name.
    asyncio.run(store.create_prompt(Prompt(
        id=uuid.uuid4(), tenant_id=TENANT_A, name="shared",
        body="tenant body", status="active",
    )))
    r_tenant = client.get("/v1/prompts/resolve?name=shared", headers=hdr_a())
    assert r_tenant.status_code == 200
    assert r_tenant.json()["body"] == "tenant body"
    assert r_tenant.json()["tenant_id"] == str(TENANT_A)

    # Tenant B still falls back to global (its own scope has no "shared").
    r_b = client.get("/v1/prompts/resolve?name=shared", headers=hdr_b())
    assert r_b.status_code == 200
    assert r_b.json()["body"] == "global body"


def test_resolve_prompt_404_when_no_active_row(client):
    resp = client.get("/v1/prompts/resolve?name=missing", headers=hdr_a())
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /v1/prompts/{id} — GET + cross-tenant
# ---------------------------------------------------------------------------


def test_get_prompt_cross_tenant_returns_404(client):
    created = client.post(
        "/v1/prompts",
        json={"name": "secret", "body": "..."},
        headers=hdr_a(),
    ).json()
    resp = client.get(f"/v1/prompts/{created['id']}", headers=hdr_b())
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /v1/prompts/{id} — PATCH status
# ---------------------------------------------------------------------------


def test_patch_prompt_status_only(client):
    created = client.post(
        "/v1/prompts",
        json={"name": "p", "body": "..."},
        headers=hdr_a(),
    ).json()
    assert created["status"] == "draft"

    resp = client.patch(
        f"/v1/prompts/{created['id']}",
        json={"status": "active"},
        headers=hdr_a(),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


def test_patch_prompt_invalid_status_rejected(client):
    created = client.post(
        "/v1/prompts",
        json={"name": "p", "body": "..."},
        headers=hdr_a(),
    ).json()
    resp = client.patch(
        f"/v1/prompts/{created['id']}",
        json={"status": "bogus"},
        headers=hdr_a(),
    )
    assert resp.status_code == 400


def test_patch_prompt_cross_tenant_rejected(client):
    created = client.post(
        "/v1/prompts",
        json={"name": "p", "body": "..."},
        headers=hdr_a(),
    ).json()
    resp = client.patch(
        f"/v1/prompts/{created['id']}",
        json={"status": "deprecated"},
        headers=hdr_b(),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /v1/prompts/{id} — DELETE soft delete
# ---------------------------------------------------------------------------


def test_delete_prompt_soft_deletes_via_status(client):
    created = client.post(
        "/v1/prompts",
        json={"name": "p", "body": "...", "status": "active"},
        headers=hdr_a(),
    ).json()
    resp = client.delete(f"/v1/prompts/{created['id']}", headers=hdr_a())
    assert resp.status_code == 200
    assert resp.json()["status"] == "deprecated"


def test_delete_prompt_cross_tenant_rejected(client):
    created = client.post(
        "/v1/prompts",
        json={"name": "p", "body": "..."},
        headers=hdr_a(),
    ).json()
    resp = client.delete(f"/v1/prompts/{created['id']}", headers=hdr_b())
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /v1/prompts — list filters
# ---------------------------------------------------------------------------


def test_list_prompts_filters_by_name_and_status(client):
    client.post(
        "/v1/prompts",
        json={"name": "alpha", "body": "...", "status": "active"},
        headers=hdr_a(),
    )
    client.post(
        "/v1/prompts",
        json={"name": "beta", "body": "...", "status": "active"},
        headers=hdr_a(),
    )
    client.post(
        "/v1/prompts",
        json={"name": "alpha", "body": "...", "status": "draft"},
        headers=hdr_a(),
    )

    # By name
    r_alpha = client.get("/v1/prompts?name=alpha", headers=hdr_a())
    assert r_alpha.status_code == 200
    assert len(r_alpha.json()) == 2
    assert all(p["name"] == "alpha" for p in r_alpha.json())

    # By name+status
    r_alpha_active = client.get(
        "/v1/prompts?name=alpha&status=active", headers=hdr_a()
    )
    assert r_alpha_active.status_code == 200
    assert len(r_alpha_active.json()) == 1


def test_list_prompts_isolates_tenants(client):
    """Tenant B should not see Tenant A's tenant-owned prompts."""
    client.post(
        "/v1/prompts",
        json={"name": "a-only", "body": "..."},
        headers=hdr_a(),
    )
    r = client.get("/v1/prompts?include_global=false", headers=hdr_b())
    assert r.status_code == 200
    names = [p["name"] for p in r.json()]
    assert "a-only" not in names
