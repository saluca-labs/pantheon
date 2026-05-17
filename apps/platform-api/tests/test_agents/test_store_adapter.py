"""Wave H.2.b — tests for the AgentStore + PromptStore adapter layer.

Covers:
  * secret_ref: env:// resolution, reserved schemes, malformed input
  * LocalPg AgentStore: CRUD, list, get-by-persona, health
  * LocalPg PromptStore: CRUD, resolve_active_prompt fallback, version chain
  * Config table: get/set, defaults, agents-store config helpers
  * Factory: kind dispatch, error surfaces
  * Supabase store: header construction (no live calls)
"""

import os
import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.database.connection import Base
from src.database.models import SoulTenant

from src.agents import (
    Agent,
    AgentStore,
    Prompt,
    PromptStore,
)
from src.agents import config as agents_config
from src.agents import factory as agents_factory
from src.agents import local_pg_store
from src.agents.secret_ref import (
    SecretRefError,
    describe_secret_ref,
    resolve_secret_ref,
)
from src.agents.supabase_store import (
    SupabaseAgentStore,
    SupabasePromptStore,
)


TEST_DB = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def test_engine():
    eng = create_async_engine(
        TEST_DB,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def patched_factory(test_engine, monkeypatch):
    """Point the module-level `async_session_factory` at the test engine.

    The store helpers and config helpers all reach for
    `src.database.connection.async_session_factory`; we patch BOTH the
    canonical location and the names already-imported inside each module.
    """
    factory = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
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
async def tenant(patched_factory):
    """Seed one tenant we can attach agents/prompts to."""
    async with patched_factory() as s:
        t = SoulTenant(
            id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
            name="Saluca",
            slug="saluca",
            tier="enterprise",
            status="active",
        )
        s.add(t)
        await s.commit()
        return t


# ---------------------------------------------------------------------------
# secret_ref
# ---------------------------------------------------------------------------


def test_secret_ref_env_resolves():
    os.environ["TEST_AGENTS_BLAH"] = "hello"
    try:
        assert resolve_secret_ref("env://TEST_AGENTS_BLAH") == "hello"
    finally:
        os.environ.pop("TEST_AGENTS_BLAH", None)


def test_secret_ref_env_missing_var_raises():
    os.environ.pop("DEFINITELY_NOT_SET_AGENTS_42", None)
    with pytest.raises(SecretRefError):
        resolve_secret_ref("env://DEFINITELY_NOT_SET_AGENTS_42")


def test_secret_ref_missing_scheme_raises():
    with pytest.raises(SecretRefError):
        resolve_secret_ref("just-a-string")


def test_secret_ref_reserved_schemes_raise_not_implemented():
    for scheme in ("vault", "gcpsm", "awssm", "enc"):
        with pytest.raises(NotImplementedError):
            resolve_secret_ref(f"{scheme}://anything")


def test_secret_ref_unknown_scheme_raises():
    with pytest.raises(SecretRefError):
        resolve_secret_ref("ftp://server/path")


def test_describe_secret_ref_safe_summary():
    desc = describe_secret_ref("env://MY_KEY")
    assert desc == {"scheme": "env", "target": "MY_KEY", "valid": True}
    assert describe_secret_ref(None)["valid"] is False
    assert describe_secret_ref("not-a-uri")["valid"] is False


# ---------------------------------------------------------------------------
# LocalPg AgentStore
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_localpg_agent_crud_roundtrip(patched_factory, tenant):
    store = local_pg_store.LocalPgAgentStore()

    new = Agent(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        persona_id="alfred",
        name="Alfred",
        description="Orchestrator",
        prompt_id=None,
        metadata={"role": "orchestrator"},
    )
    saved = await store.create_agent(new)
    assert saved.persona_id == "alfred"
    assert saved.metadata == {"role": "orchestrator"}

    fetched = await store.get_agent(saved.id)
    assert fetched is not None
    assert fetched.name == "Alfred"

    by_persona = await store.get_agent_by_persona(tenant.id, "alfred")
    assert by_persona is not None and by_persona.id == saved.id

    updated = await store.update_agent(saved.id, {"name": "Alfred-v2", "description": "Updated"})
    assert updated is not None
    assert updated.name == "Alfred-v2"
    assert updated.description == "Updated"

    # Unknown patch keys silently dropped
    same = await store.update_agent(saved.id, {"bogus": 123})
    assert same is not None and same.name == "Alfred-v2"

    listed = await store.list_agents(tenant_id=tenant.id)
    assert len(listed) == 1

    deleted = await store.delete_agent(saved.id)
    assert deleted is True
    assert await store.get_agent(saved.id) is None
    assert await store.delete_agent(saved.id) is False


@pytest.mark.asyncio
async def test_localpg_agent_list_includes_global(patched_factory, tenant):
    store = local_pg_store.LocalPgAgentStore()
    await store.create_agent(
        Agent(id=uuid.uuid4(), tenant_id=tenant.id, persona_id="t1",
              name="t1", description=None, prompt_id=None)
    )
    await store.create_agent(
        Agent(id=uuid.uuid4(), tenant_id=None, persona_id="g1",
              name="g1", description=None, prompt_id=None)
    )
    rows = await store.list_agents(tenant_id=tenant.id, include_global=True)
    personas = sorted(r.persona_id for r in rows)
    assert personas == ["g1", "t1"]

    rows_tenant_only = await store.list_agents(tenant_id=tenant.id, include_global=False)
    assert [r.persona_id for r in rows_tenant_only] == ["t1"]


@pytest.mark.asyncio
async def test_localpg_agent_health_check(patched_factory):
    store = local_pg_store.LocalPgAgentStore()
    health = await store.health_check()
    assert health["ok"] is True
    assert isinstance(health["latency_ms"], int)


# ---------------------------------------------------------------------------
# LocalPg PromptStore
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_localpg_prompt_crud_and_versions(patched_factory, tenant):
    store = local_pg_store.LocalPgPromptStore()

    p = await store.create_prompt(Prompt(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="research-coach",
        body="be helpful",
    ))
    assert p.version == 1
    assert p.status == "active"

    v2 = await store.create_prompt_version(p.id, "be more helpful")
    assert v2.version == 2
    assert v2.supersedes_id == p.id
    assert v2.status == "active"

    # Old row should be deprecated now
    old = await store.get_prompt(p.id)
    assert old is not None and old.status == "deprecated"

    active = await store.resolve_active_prompt(tenant.id, "research-coach")
    assert active is not None and active.id == v2.id


@pytest.mark.asyncio
async def test_localpg_prompt_resolve_falls_back_to_global(patched_factory, tenant):
    store = local_pg_store.LocalPgPromptStore()
    g = await store.create_prompt(Prompt(
        id=uuid.uuid4(),
        tenant_id=None,
        name="global-only",
        body="global body",
    ))
    # No tenant row yet → falls back to global
    active = await store.resolve_active_prompt(tenant.id, "global-only")
    assert active is not None and active.id == g.id

    # Now add a tenant row → it should win
    t = await store.create_prompt(Prompt(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="global-only",
        body="tenant override",
    ))
    active2 = await store.resolve_active_prompt(tenant.id, "global-only")
    assert active2 is not None and active2.id == t.id


@pytest.mark.asyncio
async def test_localpg_prompt_list_filters(patched_factory, tenant):
    store = local_pg_store.LocalPgPromptStore()
    await store.create_prompt(Prompt(id=uuid.uuid4(), tenant_id=tenant.id, name="a", body="..."))
    await store.create_prompt(Prompt(id=uuid.uuid4(), tenant_id=tenant.id, name="b", body="..."))
    listed = await store.list_prompts(tenant_id=tenant.id)
    assert len(listed) == 2
    just_a = await store.list_prompts(tenant_id=tenant.id, name="a")
    assert len(just_a) == 1 and just_a[0].name == "a"


@pytest.mark.asyncio
async def test_localpg_prompt_create_version_missing_raises(patched_factory):
    store = local_pg_store.LocalPgPromptStore()
    with pytest.raises(LookupError):
        await store.create_prompt_version(uuid.uuid4(), "body")


# ---------------------------------------------------------------------------
# _pantheon_config helpers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_config_get_default_when_absent(patched_factory):
    val = await agents_config.get_config("missing.key", default="fallback")
    assert val == "fallback"


@pytest.mark.asyncio
async def test_config_set_then_get(patched_factory):
    await agents_config.set_config("test.key", {"nested": [1, 2, 3]})
    val = await agents_config.get_config("test.key")
    assert val == {"nested": [1, 2, 3]}


@pytest.mark.asyncio
async def test_agents_store_config_defaults(patched_factory):
    kind, cfg = await agents_config.get_agents_store_config()
    assert kind == "local"
    assert cfg == {}


@pytest.mark.asyncio
async def test_agents_store_config_set_supabase(patched_factory):
    await agents_config.set_agents_store_config(
        "supabase",
        {"url": "https://x.supabase.co", "service_role_key_ref": "env://X"},
    )
    kind, cfg = await agents_config.get_agents_store_config()
    assert kind == "supabase"
    assert cfg["url"] == "https://x.supabase.co"


@pytest.mark.asyncio
async def test_agents_store_config_invalid_kind_raises(patched_factory):
    with pytest.raises(ValueError):
        await agents_config.set_agents_store_config("redis", {})


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_factory_returns_local_by_default(patched_factory):
    store = await agents_factory.get_agent_store()
    assert isinstance(store, AgentStore)
    assert isinstance(store, local_pg_store.LocalPgAgentStore)

    pstore = await agents_factory.get_prompt_store()
    assert isinstance(pstore, PromptStore)


@pytest.mark.asyncio
async def test_factory_returns_supabase_when_configured(patched_factory):
    os.environ["TEST_SB_KEY"] = "fake-service-role-key"
    try:
        store = await agents_factory.get_agent_store(
            kind="supabase",
            config={
                "url": "https://x.supabase.co",
                "service_role_key_ref": "env://TEST_SB_KEY",
            },
        )
        assert isinstance(store, SupabaseAgentStore)
    finally:
        os.environ.pop("TEST_SB_KEY", None)


@pytest.mark.asyncio
async def test_factory_supabase_missing_url_raises(patched_factory):
    with pytest.raises(agents_factory.FactoryError):
        await agents_factory.get_agent_store(
            kind="supabase",
            config={"service_role_key_ref": "env://NOPE"},
        )


@pytest.mark.asyncio
async def test_factory_supabase_unresolvable_secret_raises(patched_factory):
    os.environ.pop("DEFINITELY_NOT_SET_XYZ", None)
    with pytest.raises(agents_factory.FactoryError):
        await agents_factory.get_agent_store(
            kind="supabase",
            config={
                "url": "https://x.supabase.co",
                "service_role_key_ref": "env://DEFINITELY_NOT_SET_XYZ",
            },
        )


@pytest.mark.asyncio
async def test_factory_unknown_kind_raises(patched_factory):
    with pytest.raises(agents_factory.FactoryError):
        await agents_factory.get_agent_store(kind="bogus", config={})


# ---------------------------------------------------------------------------
# Supabase store — construction-only smoke (no live HTTP)
# ---------------------------------------------------------------------------


def test_supabase_store_construction_strips_trailing_slash():
    s = SupabaseAgentStore(url="https://x.supabase.co/", service_role_key="k")
    assert s._base == "https://x.supabase.co"


def test_supabase_store_requires_url_and_key():
    with pytest.raises(ValueError):
        SupabaseAgentStore(url="", service_role_key="k")
    with pytest.raises(ValueError):
        SupabasePromptStore(url="https://x", service_role_key="")


def test_supabase_headers_include_apikey_and_bearer():
    s = SupabasePromptStore(url="https://x.supabase.co", service_role_key="mykey")
    h = s._headers(prefer="return=representation")
    assert h["apikey"] == "mykey"
    assert h["Authorization"] == "Bearer mykey"
    assert h["Prefer"] == "return=representation"
    assert h["Content-Type"] == "application/json"
