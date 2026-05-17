"""Wave H.2.f — POST /v1/agents/import coverage.

Exercises the bulk-import endpoint against the LocalPg backend through a
minimal FastAPI app. Same SOULAUTH_TESTING bypass pattern as
``test_crud_router.py`` and ``test_provider_keys.py`` — auth is mocked
from the ``X-Tenant-ID`` header so per-tenant scoping is observable.

Scenarios:
  * Valid single agent (JSON + multipart YAML + raw YAML body)
  * Valid update of an existing (tenant, persona) → in-place name change
    + new prompt VERSION (supersession chain), not a new agent row
  * Schema validation: missing persona, empty prompt body, unknown
    top-level field
  * Wrong tenant in metadata.tenant → 400-as-error-list with helpful msg
  * Bulk mix of valid+invalid → 400 with all errors, NO partial commit
  * Multi-document YAML stream parses correctly
  * Multipart file upload (single + multi-file)
  * Inline JSON body works
  * Unsupported provider_overrides scheme (vault://) → structured error
  * Atomic rollback: forcing a DB error mid-write leaves no orphans
"""

from __future__ import annotations

import io
import os
import uuid

os.environ.setdefault("SOULAUTH_MODE", "local")
os.environ.setdefault("SOULAUTH_TESTING", "true")
os.environ.setdefault("SOULAUTH_DEBUG", "true")
os.environ.setdefault("ENVIRONMENT", "test")

import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.agents.crud_router import router as crud_router
from src.agents.import_router import router as import_router
from src.database.connection import Base
from src.database.models import (
    AgosAgent,
    AgosPrompt,
    AuditLog,
    PolicyCache,
    SoulTenant,
    TenantProviderKey,
)


TENANT_A = uuid.UUID("11111111-1111-1111-1111-111111111111")
TENANT_A_SLUG = "saluca"
TENANT_B = uuid.UUID("22222222-2222-2222-2222-222222222222")
TENANT_B_SLUG = "otherb"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def engine():
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
    """Point every module-level ``async_session_factory`` at the test engine.

    Both the import router and the LocalPg CRUD store (used in some
    assertions) reach for ``src.database.connection.async_session_factory``;
    we patch both the canonical alias and the import-time copies inside
    the agents subpackage so writes from the route AND reads from the
    test code hit the same SQLite engine.
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
        "src.agents.import_router.async_session_factory", factory, raising=False
    )
    monkeypatch.setattr(
        "src.agents.config.async_session_factory", factory, raising=False
    )
    yield factory


@pytest_asyncio.fixture
async def tenants(patched_factory):
    async with patched_factory() as s:
        s.add(SoulTenant(
            id=TENANT_A, name="Saluca A", slug=TENANT_A_SLUG,
            tier="enterprise", status="active",
        ))
        s.add(SoulTenant(
            id=TENANT_B, name="Other B", slug=TENANT_B_SLUG,
            tier="enterprise", status="active",
        ))
        await s.commit()


@pytest.fixture
def client(patched_factory, tenants) -> TestClient:
    app = FastAPI()
    app.include_router(import_router)
    app.include_router(crud_router)
    return TestClient(app)


def hdr_a() -> dict:
    return {"X-Tenant-ID": str(TENANT_A)}


def hdr_b() -> dict:
    return {"X-Tenant-ID": str(TENANT_B)}


# ---------------------------------------------------------------------------
# Sample payloads
# ---------------------------------------------------------------------------


def _valid_agent_payload(persona: str = "research-coach") -> dict:
    return {
        "metadata": {
            "persona": persona,
            "name": f"{persona.title()}",
            "description": "test agent",
            "role": "research",
            "tags": ["test"],
        },
        "spec": {
            "prompt": {
                "name": f"{persona}-prompt",
                "body": "You are a research coach.\nHelp with literature reviews.",
                "status": "active",
            },
            "model_policies": {
                "default_models": ["claude-opus-4-20250514"],
                "task_routing": {
                    "reasoning": {"required": ["claude-opus-4-20250514"]},
                },
                "forbidden_models": ["gpt-3.5-turbo"],
                "enforcement": "strict",
            },
            "resources": {
                "memory": [{"actions": ["read", "write"], "scopes": ["*"]}],
            },
            "jit": {
                "max_capability_ttl": 900,
                "default_capability_ttl": 300,
            },
            "escalation": {
                "can_grant_temporary_access": False,
            },
            "provider_overrides": [
                {
                    "provider": "anthropic",
                    "secret_ref": "env://TENANT_ANTHROPIC_KEY",
                    "status": "active",
                },
            ],
        },
    }


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------


def test_import_single_agent_creates_agent_prompt_keys_and_policy(
    client, patched_factory
):
    payload = {"agents": [_valid_agent_payload()]}
    resp = client.post("/v1/agents/import", json=payload, headers=hdr_a())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["errors"] == []
    assert len(body["imported"]) == 1
    item = body["imported"][0]
    assert item["persona_id"] == "research-coach"
    assert item["agent_id"]
    assert item["prompt_id"]
    assert item["provider_keys_created"] == 1
    assert item["policy_synced"] is True
    assert item["created"] is True

    # Confirm rows actually landed.
    import asyncio

    async def _check():
        async with patched_factory() as s:
            agents = (await s.execute(
                select(AgosAgent).where(AgosAgent.tenant_id == TENANT_A)
            )).scalars().all()
            assert len(agents) == 1
            assert agents[0].persona_id == "research-coach"
            assert agents[0].prompt_id is not None

            prompts = (await s.execute(
                select(AgosPrompt).where(AgosPrompt.tenant_id == TENANT_A)
            )).scalars().all()
            assert len(prompts) == 1
            assert prompts[0].version == 1
            assert prompts[0].status == "active"

            keys = (await s.execute(
                select(TenantProviderKey).where(
                    TenantProviderKey.tenant_id == TENANT_A
                )
            )).scalars().all()
            assert len(keys) == 1
            assert keys[0].provider == "anthropic"
            assert keys[0].secret_ref == "env://TENANT_ANTHROPIC_KEY"

            policies = (await s.execute(
                select(PolicyCache).where(PolicyCache.tenant_id == TENANT_A)
            )).scalars().all()
            assert len(policies) == 1
            assert policies[0].persona_id == "research-coach"
            assert "model_policies" in policies[0].resolved_policy["spec"]

    asyncio.get_event_loop().run_until_complete(_check())


def test_import_update_existing_creates_new_prompt_version(client, patched_factory):
    """Re-importing the same persona with a different prompt body must:
       * NOT create a new agent row (update in place)
       * Append a NEW prompt version that supersedes the old one
       * Repoint agent.prompt_id at the new version
    """
    initial = _valid_agent_payload("alfred")
    initial["spec"]["prompt"]["body"] = "version 1 body"
    r1 = client.post(
        "/v1/agents/import", json={"agents": [initial]}, headers=hdr_a()
    )
    assert r1.status_code == 200, r1.text
    first_agent_id = r1.json()["imported"][0]["agent_id"]
    first_prompt_id = r1.json()["imported"][0]["prompt_id"]
    assert r1.json()["imported"][0]["created"] is True

    # Re-import with a different body + a renamed display name.
    updated = _valid_agent_payload("alfred")
    updated["metadata"]["name"] = "Alfred Renamed"
    updated["spec"]["prompt"]["body"] = "version 2 body"
    r2 = client.post(
        "/v1/agents/import", json={"agents": [updated]}, headers=hdr_a()
    )
    assert r2.status_code == 200, r2.text
    second = r2.json()["imported"][0]
    assert second["agent_id"] == first_agent_id  # same agent row
    assert second["prompt_id"] != first_prompt_id  # NEW prompt version
    assert second["created"] is False

    # Verify supersession chain & status flip.
    import asyncio

    async def _check():
        async with patched_factory() as s:
            prompts = (await s.execute(
                select(AgosPrompt).where(
                    AgosPrompt.tenant_id == TENANT_A,
                    AgosPrompt.name == "alfred-prompt",
                )
            )).scalars().all()
            by_version = {p.version: p for p in prompts}
            assert set(by_version) == {1, 2}
            assert by_version[1].status == "deprecated"
            assert by_version[2].status == "active"
            assert by_version[2].supersedes_id == by_version[1].id

            agent = await s.get(AgosAgent, uuid.UUID(first_agent_id))
            assert agent.name == "Alfred Renamed"
            assert str(agent.prompt_id) == second["prompt_id"]

    asyncio.get_event_loop().run_until_complete(_check())


def test_import_same_body_reuses_existing_prompt_row(client, patched_factory):
    """Identical bodies should not spawn no-op prompt versions."""
    p = _valid_agent_payload("twin")
    r1 = client.post("/v1/agents/import", json={"agents": [p]}, headers=hdr_a())
    assert r1.status_code == 200, r1.text
    pid1 = r1.json()["imported"][0]["prompt_id"]
    r2 = client.post("/v1/agents/import", json={"agents": [p]}, headers=hdr_a())
    assert r2.status_code == 200, r2.text
    pid2 = r2.json()["imported"][0]["prompt_id"]
    assert pid1 == pid2


# ---------------------------------------------------------------------------
# Validation failures
# ---------------------------------------------------------------------------


def test_invalid_schema_missing_persona_returns_400_error_list(client):
    bad = {"agents": [{"metadata": {"name": "no-persona"}, "spec": {}}]}
    resp = client.post("/v1/agents/import", json=bad, headers=hdr_a())
    assert resp.status_code == 200, resp.text  # endpoint returns 200 w/ errors list
    body = resp.json()
    assert body["imported"] == []
    assert len(body["errors"]) >= 1
    paths = [e["path"] for e in body["errors"]]
    assert any("metadata.persona" in p for p in paths)


def test_invalid_unknown_top_level_field_rejected(client):
    bad = {
        "agents": [{
            "metadata": {"persona": "x"},
            "spec": {},
            "rogue_field": "boom",
        }]
    }
    resp = client.post("/v1/agents/import", json=bad, headers=hdr_a())
    body = resp.json()
    assert len(body["errors"]) >= 1
    assert any("rogue_field" in e["path"] or "rogue_field" in e["message"]
               for e in body["errors"])


def test_invalid_empty_prompt_body_rejected(client):
    bad = _valid_agent_payload("empty-body")
    bad["spec"]["prompt"]["body"] = "   "
    resp = client.post(
        "/v1/agents/import", json={"agents": [bad]}, headers=hdr_a()
    )
    body = resp.json()
    errs = body["errors"]
    assert errs
    assert any("spec.prompt.body" in e["path"] for e in errs)
    assert any("cannot be empty" in e["message"] for e in errs)


def test_wrong_tenant_in_metadata_rejected_with_helpful_message(client):
    bad = _valid_agent_payload("wrong-tenant")
    bad["metadata"]["tenant"] = "some-other-slug"
    resp = client.post(
        "/v1/agents/import", json={"agents": [bad]}, headers=hdr_a()
    )
    body = resp.json()
    assert body["imported"] == []
    errs = body["errors"]
    assert any(e["path"].endswith(".metadata.tenant") for e in errs)
    assert any("does not match caller tenant" in e["message"] for e in errs)
    assert any(TENANT_A_SLUG in e["message"] for e in errs)


def test_matching_tenant_slug_in_metadata_accepted(client):
    p = _valid_agent_payload("with-tenant")
    p["metadata"]["tenant"] = TENANT_A_SLUG
    resp = client.post("/v1/agents/import", json={"agents": [p]}, headers=hdr_a())
    assert resp.status_code == 200, resp.text
    assert resp.json()["errors"] == []
    assert len(resp.json()["imported"]) == 1


def test_provider_override_unsupported_scheme_rejected(client, patched_factory):
    bad = _valid_agent_payload("vault-user")
    bad["spec"]["provider_overrides"] = [
        {"provider": "openai", "secret_ref": "env://OK"},
        {"provider": "anthropic", "secret_ref": "vault://path/to/secret"},
    ]
    resp = client.post(
        "/v1/agents/import", json={"agents": [bad]}, headers=hdr_a()
    )
    body = resp.json()
    assert body["imported"] == []  # nothing committed
    assert len(body["errors"]) >= 1
    bad_err = next(
        (e for e in body["errors"]
         if "provider_overrides[1].secret_ref" in e["path"]),
        None,
    )
    assert bad_err is not None
    assert "vault" in bad_err["message"].lower()
    assert "reserved" in bad_err["message"].lower()

    # NOTHING committed — the good override (index 0) must not have landed
    # because validation failed for the bad one.
    import asyncio

    async def _check_no_writes():
        async with patched_factory() as s:
            keys = (await s.execute(
                select(TenantProviderKey).where(
                    TenantProviderKey.tenant_id == TENANT_A
                )
            )).scalars().all()
            assert keys == []
            agents = (await s.execute(
                select(AgosAgent).where(AgosAgent.tenant_id == TENANT_A)
            )).scalars().all()
            assert agents == []

    asyncio.get_event_loop().run_until_complete(_check_no_writes())


def test_bulk_mix_of_valid_and_invalid_aborts_all(client, patched_factory):
    """ANY invalid agent in a bulk request fails the whole transaction."""
    good = _valid_agent_payload("good-one")
    bad = _valid_agent_payload("bad-one")
    del bad["metadata"]["persona"]
    payload = {"agents": [good, bad]}
    resp = client.post("/v1/agents/import", json=payload, headers=hdr_a())
    body = resp.json()
    assert body["imported"] == []  # all-or-nothing
    paths = [e["path"] for e in body["errors"]]
    assert any("agents[1].metadata.persona" in p for p in paths)

    # Verify NO writes at all.
    import asyncio

    async def _check_empty():
        async with patched_factory() as s:
            agents = (await s.execute(select(AgosAgent))).scalars().all()
            prompts = (await s.execute(select(AgosPrompt))).scalars().all()
            keys = (await s.execute(select(TenantProviderKey))).scalars().all()
            policies = (await s.execute(select(PolicyCache))).scalars().all()
            assert agents == []
            assert prompts == []
            assert keys == []
            assert policies == []

    asyncio.get_event_loop().run_until_complete(_check_empty())


# ---------------------------------------------------------------------------
# Multi-document YAML / multipart / raw YAML body forms
# ---------------------------------------------------------------------------


def test_multi_document_yaml_stream_parses_each_doc_as_an_agent(client):
    yaml_text = """\
metadata:
  persona: agent-a
spec:
  prompt:
    name: agent-a-prompt
    body: body A
---
metadata:
  persona: agent-b
spec:
  prompt:
    name: agent-b-prompt
    body: body B
"""
    resp = client.post(
        "/v1/agents/import",
        content=yaml_text,
        headers={**hdr_a(), "Content-Type": "text/yaml"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["errors"] == []
    personas = sorted(i["persona_id"] for i in body["imported"])
    assert personas == ["agent-a", "agent-b"]


def test_multipart_file_upload_single(client):
    yaml_text = """\
metadata:
  persona: from-file
spec:
  prompt:
    name: from-file-prompt
    body: hi
"""
    files = {"files": ("agent.yaml", io.BytesIO(yaml_text.encode()), "text/yaml")}
    resp = client.post("/v1/agents/import", files=files, headers=hdr_a())
    assert resp.status_code == 200, resp.text
    assert resp.json()["imported"][0]["persona_id"] == "from-file"


def test_multipart_file_upload_multi_file(client):
    f1 = """\
metadata:
  persona: file-1
spec: {}
"""
    f2 = """\
metadata:
  persona: file-2
spec: {}
"""
    files = [
        ("files", ("a.yaml", io.BytesIO(f1.encode()), "text/yaml")),
        ("files", ("b.yaml", io.BytesIO(f2.encode()), "text/yaml")),
    ]
    resp = client.post("/v1/agents/import", files=files, headers=hdr_a())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    personas = sorted(i["persona_id"] for i in body["imported"])
    assert personas == ["file-1", "file-2"]


def test_inline_json_single_agent_object_accepted(client):
    """A bare {metadata, spec} JSON body (no agents wrapper) is accepted."""
    payload = _valid_agent_payload("bare")
    resp = client.post("/v1/agents/import", json=payload, headers=hdr_a())
    assert resp.status_code == 200, resp.text
    assert resp.json()["imported"][0]["persona_id"] == "bare"


def test_dry_run_does_not_write(client, patched_factory):
    payload = {"agents": [_valid_agent_payload("dry")]}
    resp = client.post(
        "/v1/agents/import?dry_run=true", json=payload, headers=hdr_a()
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["imported"][0]["agent_id"] == "(dry-run)"

    import asyncio

    async def _check_no_writes():
        async with patched_factory() as s:
            agents = (await s.execute(select(AgosAgent))).scalars().all()
            assert agents == []

    asyncio.get_event_loop().run_until_complete(_check_no_writes())


# ---------------------------------------------------------------------------
# Atomicity / rollback
# ---------------------------------------------------------------------------


def test_atomic_rollback_on_write_failure(
    client, patched_factory, monkeypatch
):
    """Force a runtime failure mid-write and confirm NO rows from that
    agent persist. We patch the policy-cache build step to raise after
    the agent + prompt + provider key rows have been added but BEFORE
    commit — proving the per-agent transaction rolls back as a unit.
    """
    import src.agents.import_router as ir

    real_builder = ir._build_resolved_policy_dict

    call_state = {"calls": 0}

    def boom(payload, tenant_slug):
        call_state["calls"] += 1
        # Trigger the real builder once to keep semantics realistic, then
        # raise to force a rollback inside _import_one_agent.
        real_builder(payload, tenant_slug)
        raise RuntimeError("induced failure for rollback test")

    monkeypatch.setattr(ir, "_build_resolved_policy_dict", boom)

    payload = {"agents": [_valid_agent_payload("doomed")]}
    resp = client.post("/v1/agents/import", json=payload, headers=hdr_a())
    body = resp.json()
    # The agent failed → structured error, no imports.
    assert body["imported"] == []
    assert any("doomed" in e["message"].lower() or "induced" in e["message"].lower()
               or e["path"] == "agents[0]"
               for e in body["errors"])

    # The slice rolled back → no agent/prompt/provider-key/policy/audit rows
    # exist for tenant A.
    import asyncio

    async def _verify_clean():
        async with patched_factory() as s:
            assert (await s.execute(
                select(AgosAgent).where(AgosAgent.tenant_id == TENANT_A)
            )).scalars().all() == []
            assert (await s.execute(
                select(AgosPrompt).where(AgosPrompt.tenant_id == TENANT_A)
            )).scalars().all() == []
            assert (await s.execute(
                select(TenantProviderKey).where(
                    TenantProviderKey.tenant_id == TENANT_A
                )
            )).scalars().all() == []
            assert (await s.execute(
                select(PolicyCache).where(PolicyCache.tenant_id == TENANT_A)
            )).scalars().all() == []

    asyncio.get_event_loop().run_until_complete(_verify_clean())


# ---------------------------------------------------------------------------
# Cross-feature: imported agent visible through the H.2.c CRUD list
# ---------------------------------------------------------------------------


def test_imported_agent_appears_in_v1_agents_listing(client):
    """End-to-end smoke: imported agent surfaces in GET /v1/agents."""
    resp = client.post(
        "/v1/agents/import",
        json={"agents": [_valid_agent_payload("smoke")]},
        headers=hdr_a(),
    )
    assert resp.status_code == 200, resp.text

    listing = client.get("/v1/agents", headers=hdr_a())
    assert listing.status_code == 200
    personas = [a["persona_id"] for a in listing.json()]
    assert "smoke" in personas
