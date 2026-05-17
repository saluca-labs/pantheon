"""Agent + Prompt CRUD endpoints (W-H.2.c).

Sits in front of the AgentStore + PromptStore abstractions from W-H.2.b
(`apps/platform-api/src/agents/store.py`) and exposes their lifecycle
operations as HTTP. Backend selection (LocalPg vs Supabase) is handled
transparently by :func:`src.agents.factory.get_agent_store` and
:func:`src.agents.factory.get_prompt_store`.

Endpoints:

  /v1/agents
    GET    list  (?include_global=true)
    POST   create
  /v1/agents/{id}
    GET    read
    PATCH  update mutable fields
    DELETE soft-delete (status='archived'; preserves persona_id key)

  /v1/prompts
    GET    list  (?name, ?status, ?include_global)
    POST   create draft
  /v1/prompts/resolve
    GET    resolve active prompt for name (tenant wins over global)
  /v1/prompts/{id}
    GET    read
    PATCH  status only — body changes go via POST /versions
    DELETE soft-delete (status='deprecated')
  /v1/prompts/{id}/versions
    POST   append new body version (atomic supersession chain)

Tenant scoping:
  * List/resolve endpoints always pass the caller's tenant_id to the store.
  * Per-id endpoints fetch first, then check the row's tenant_id matches
    the caller's (or is NULL/global). Mismatch → 404, never 403, to avoid
    leaking existence.
  * Create endpoints FORCE the caller's tenant_id onto the row.
    Tenants cannot create global rows via this endpoint — that is a
    marketplace concern handled out-of-band.

Auth scopes (added to DEFAULT_ROLE_PERMISSIONS in W-H.2.c):
  * agents:read   — list/get
  * agents:write  — create/update/delete
  * prompts:read  — list/get/resolve
  * prompts:write — create/update/delete/version
"""

from __future__ import annotations

import uuid
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from src.agents.factory import get_agent_store, get_prompt_store
from src.agents.store import Agent, Prompt
from src.auth.rbac import require_permission


router = APIRouter(tags=["Agents CRUD"])


def _get_caller_tenant_id(request: Request) -> Optional[UUID]:
    """Pull the caller's tenant_id off the auth context.

    Reads from ``request.state.rbac_soulkey`` which is populated by
    :func:`src.auth.rbac.require_permission` for every authenticated
    code path — including the SOULAUTH_TESTING bypass (which constructs
    a mock soulkey from the ``X-Tenant-ID`` header).

    NOTE: This is intentionally distinct from
    :func:`src.admin.router._get_caller_tenant_id`, which returns None
    in testing mode to disable scoping wholesale. For agents/prompts we
    WANT tenant scoping to be exercised end-to-end in tests, so we read
    the value off the mock soulkey directly.
    """
    soulkey = getattr(request.state, "rbac_soulkey", None)
    if soulkey is None:
        return None
    tid = getattr(soulkey, "tenant_id", None)
    if tid is None:
        return None
    return tid if isinstance(tid, UUID) else UUID(str(tid))


# ---------------------------------------------------------------------------
# Pydantic wire models
# ---------------------------------------------------------------------------


class AgentResponse(BaseModel):
    """Wire shape of an :class:`Agent` dataclass."""

    id: UUID
    tenant_id: Optional[UUID]
    persona_id: str
    name: str
    description: Optional[str]
    prompt_id: Optional[UUID]
    metadata: dict
    status: str
    created_at: str
    created_by: Optional[UUID]
    updated_at: str


class AgentCreate(BaseModel):
    persona_id: str = Field(..., description="Natural key (e.g. 'alfred')")
    name: str = Field(..., description="Display name")
    description: Optional[str] = Field(None)
    prompt_id: Optional[UUID] = Field(None)
    metadata: Optional[dict] = Field(default_factory=dict)
    status: Optional[str] = Field(
        "active", description="active | draft | archived"
    )


class AgentPatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    prompt_id: Optional[UUID] = None
    metadata: Optional[dict] = None
    status: Optional[str] = None


class PromptResponse(BaseModel):
    id: UUID
    tenant_id: Optional[UUID]
    name: str
    body: str
    version: int
    supersedes_id: Optional[UUID]
    status: str
    metadata: dict
    created_at: str
    created_by: Optional[UUID]


class PromptCreate(BaseModel):
    name: str
    body: str
    metadata: Optional[dict] = Field(default_factory=dict)
    status: Optional[str] = Field(
        "draft", description="draft | active | deprecated"
    )


class PromptVersionCreate(BaseModel):
    body: str


class PromptPatch(BaseModel):
    status: Optional[str] = Field(
        None, description="Only status is mutable — bodies are append-only"
    )


# ---------------------------------------------------------------------------
# Dataclass → response adapters
# ---------------------------------------------------------------------------


def _agent_to_response(a: Agent) -> AgentResponse:
    return AgentResponse(
        id=a.id,
        tenant_id=a.tenant_id,
        persona_id=a.persona_id,
        name=a.name,
        description=a.description,
        prompt_id=a.prompt_id,
        metadata=dict(a.metadata or {}),
        status=a.status,
        created_at=a.created_at or "",
        created_by=a.created_by,
        updated_at=a.updated_at or "",
    )


def _prompt_to_response(p: Prompt) -> PromptResponse:
    return PromptResponse(
        id=p.id,
        tenant_id=p.tenant_id,
        name=p.name,
        body=p.body,
        version=p.version,
        supersedes_id=p.supersedes_id,
        status=p.status,
        metadata=dict(p.metadata or {}),
        created_at=p.created_at or "",
        created_by=p.created_by,
    )


def _visible_to(row_tenant: Optional[UUID], caller_tenant: Optional[UUID]) -> bool:
    """A row is visible to caller iff it is global OR owned by caller.

    When caller_tenant is None (test bypass), every row is visible — this
    matches the pattern in :mod:`src.admin.router` where the SOULAUTH_TESTING
    bypass disables tenant scoping.
    """
    if caller_tenant is None:
        return True
    if row_tenant is None:
        return True  # global rows always visible
    return row_tenant == caller_tenant


# ---------------------------------------------------------------------------
# /v1/agents
# ---------------------------------------------------------------------------


@router.get(
    "/v1/agents",
    response_model=list[AgentResponse],
    summary="List agents (caller's tenant + optional globals)",
    dependencies=[Depends(require_permission("agents:read"))],
)
async def list_agents_route(
    request: Request,
    include_global: bool = Query(
        True, description="When true, also include rows where tenant_id IS NULL"
    ),
):
    caller_tenant = _get_caller_tenant_id(request)
    store = await get_agent_store()
    agents = await store.list_agents(
        tenant_id=caller_tenant, include_global=include_global
    )
    return [_agent_to_response(a) for a in agents]


@router.post(
    "/v1/agents",
    response_model=AgentResponse,
    summary="Create an agent (tenant_id forced to caller)",
    dependencies=[Depends(require_permission("agents:write"))],
    responses={
        409: {"description": "(tenant, persona_id) already exists"},
    },
)
async def create_agent_route(
    request: Request,
    body: AgentCreate,
):
    caller_tenant = _get_caller_tenant_id(request)
    store = await get_agent_store()

    # Reject duplicate (tenant, persona_id) early to surface a clean 409
    # rather than letting the unique-constraint violation bubble up as a 500.
    existing = await store.get_agent_by_persona(caller_tenant, body.persona_id)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"agent with persona_id={body.persona_id!r} already exists for this tenant",
        )

    candidate = Agent(
        id=uuid.uuid4(),
        tenant_id=caller_tenant,   # forced — body's tenant_id is ignored by design
        persona_id=body.persona_id,
        name=body.name,
        description=body.description,
        prompt_id=body.prompt_id,
        metadata=dict(body.metadata or {}),
        status=body.status or "active",
    )
    saved = await store.create_agent(candidate)
    return _agent_to_response(saved)


@router.get(
    "/v1/agents/{agent_id}",
    response_model=AgentResponse,
    summary="Get one agent by UUID",
    dependencies=[Depends(require_permission("agents:read"))],
)
async def get_agent_route(
    agent_id: UUID,
    request: Request,
):
    caller_tenant = _get_caller_tenant_id(request)
    store = await get_agent_store()
    agent = await store.get_agent(agent_id)
    if agent is None or not _visible_to(agent.tenant_id, caller_tenant):
        # Don't leak existence — same 404 for both "not found" and
        # "belongs to another tenant".
        raise HTTPException(status_code=404, detail="Agent not found")
    return _agent_to_response(agent)


@router.patch(
    "/v1/agents/{agent_id}",
    response_model=AgentResponse,
    summary="Update mutable agent fields",
    dependencies=[Depends(require_permission("agents:write"))],
)
async def patch_agent_route(
    agent_id: UUID,
    body: AgentPatch,
    request: Request,
):
    caller_tenant = _get_caller_tenant_id(request)
    store = await get_agent_store()

    existing = await store.get_agent(agent_id)
    if existing is None or not _visible_to(existing.tenant_id, caller_tenant):
        raise HTTPException(status_code=404, detail="Agent not found")

    # Global rows are read-only via the tenant CRUD surface — editing
    # a global template is a marketplace concern.
    if existing.tenant_id is None and caller_tenant is not None:
        raise HTTPException(
            status_code=403,
            detail="Global agents are read-only via this endpoint",
        )

    patch = body.model_dump(exclude_unset=True, exclude_none=False)
    # exclude_unset already strips fields the client didn't send; we then
    # drop explicit Nones for fields whose semantics don't accept None
    # (status), but allow None for description / prompt_id which DO accept it.
    if "status" in patch and patch["status"] is None:
        patch.pop("status")
    if "name" in patch and patch["name"] is None:
        patch.pop("name")
    if "metadata" in patch and patch["metadata"] is None:
        patch.pop("metadata")

    updated = await store.update_agent(agent_id, patch)
    if updated is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _agent_to_response(updated)


@router.delete(
    "/v1/agents/{agent_id}",
    response_model=AgentResponse,
    summary="Soft-delete an agent (status='archived')",
    dependencies=[Depends(require_permission("agents:write"))],
)
async def delete_agent_route(
    agent_id: UUID,
    request: Request,
):
    """Soft-delete via status='archived'.

    Hard delete is intentionally avoided: persona_id is the natural join
    key for SoulKey rows and policy cache lookups, and orphaning those
    references would silently break auth flows. Operators who really need
    a hard delete can call the store layer directly.
    """
    caller_tenant = _get_caller_tenant_id(request)
    store = await get_agent_store()

    existing = await store.get_agent(agent_id)
    if existing is None or not _visible_to(existing.tenant_id, caller_tenant):
        raise HTTPException(status_code=404, detail="Agent not found")

    if existing.tenant_id is None and caller_tenant is not None:
        raise HTTPException(
            status_code=403,
            detail="Global agents are read-only via this endpoint",
        )

    archived = await store.update_agent(agent_id, {"status": "archived"})
    if archived is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _agent_to_response(archived)


# ---------------------------------------------------------------------------
# /v1/prompts
# ---------------------------------------------------------------------------


@router.get(
    "/v1/prompts",
    response_model=list[PromptResponse],
    summary="List prompts (caller's tenant + optional globals)",
    dependencies=[Depends(require_permission("prompts:read"))],
)
async def list_prompts_route(
    request: Request,
    name: Optional[str] = Query(None, description="Filter by prompt name"),
    status: Optional[str] = Query(
        None, description="Filter by status: draft | active | deprecated"
    ),
    include_global: bool = Query(
        True, description="When true, also include rows where tenant_id IS NULL"
    ),
):
    caller_tenant = _get_caller_tenant_id(request)
    store = await get_prompt_store()

    # The store's list_prompts filters strictly by tenant_id; to express
    # "caller's rows + globals" we issue two queries and merge.
    rows: list[Prompt] = []
    if caller_tenant is not None:
        rows.extend(await store.list_prompts(
            tenant_id=caller_tenant, name=name, status=status
        ))
        if include_global:
            rows.extend(await store.list_prompts(
                tenant_id=None, name=name, status=status
            ))
            # Filter out non-global rows that might come back from a None query
            # in stores that interpret tenant_id=None as "no filter".
            rows = [
                r for r in rows
                if r.tenant_id == caller_tenant or r.tenant_id is None
            ]
    else:
        # No caller tenant (test bypass or global admin); return everything
        # matching the filters.
        rows = await store.list_prompts(
            tenant_id=None, name=name, status=status
        )

    # De-duplicate by id (defense in depth against any store-level overlap).
    seen: set[UUID] = set()
    unique: list[Prompt] = []
    for r in rows:
        if r.id in seen:
            continue
        seen.add(r.id)
        unique.append(r)

    return [_prompt_to_response(p) for p in unique]


@router.get(
    "/v1/prompts/resolve",
    response_model=PromptResponse,
    summary="Resolve the active prompt for a name (tenant > global)",
    dependencies=[Depends(require_permission("prompts:read"))],
)
async def resolve_prompt_route(
    request: Request,
    name: str = Query(..., description="Prompt name to resolve"),
):
    caller_tenant = _get_caller_tenant_id(request)
    store = await get_prompt_store()
    resolved = await store.resolve_active_prompt(caller_tenant, name)
    if resolved is None:
        raise HTTPException(
            status_code=404,
            detail=f"No active prompt found for name={name!r}",
        )
    return _prompt_to_response(resolved)


@router.post(
    "/v1/prompts",
    response_model=PromptResponse,
    summary="Create a new prompt (version 1, tenant_id forced to caller)",
    dependencies=[Depends(require_permission("prompts:write"))],
)
async def create_prompt_route(
    request: Request,
    body: PromptCreate,
):
    caller_tenant = _get_caller_tenant_id(request)
    store = await get_prompt_store()
    candidate = Prompt(
        id=uuid.uuid4(),
        tenant_id=caller_tenant,    # forced
        name=body.name,
        body=body.body,
        version=1,
        supersedes_id=None,
        status=body.status or "draft",
        metadata=dict(body.metadata or {}),
    )
    saved = await store.create_prompt(candidate)
    return _prompt_to_response(saved)


@router.get(
    "/v1/prompts/{prompt_id}",
    response_model=PromptResponse,
    summary="Get one prompt by UUID",
    dependencies=[Depends(require_permission("prompts:read"))],
)
async def get_prompt_route(
    prompt_id: UUID,
    request: Request,
):
    caller_tenant = _get_caller_tenant_id(request)
    store = await get_prompt_store()
    prompt = await store.get_prompt(prompt_id)
    if prompt is None or not _visible_to(prompt.tenant_id, caller_tenant):
        raise HTTPException(status_code=404, detail="Prompt not found")
    return _prompt_to_response(prompt)


@router.post(
    "/v1/prompts/{prompt_id}/versions",
    response_model=PromptResponse,
    summary="Append a new body version (supersedes the previous active row)",
    dependencies=[Depends(require_permission("prompts:write"))],
)
async def create_prompt_version_route(
    prompt_id: UUID,
    body: PromptVersionCreate,
    request: Request,
):
    caller_tenant = _get_caller_tenant_id(request)
    store = await get_prompt_store()

    existing = await store.get_prompt(prompt_id)
    if existing is None or not _visible_to(existing.tenant_id, caller_tenant):
        raise HTTPException(status_code=404, detail="Prompt not found")

    if existing.tenant_id is None and caller_tenant is not None:
        raise HTTPException(
            status_code=403,
            detail="Global prompts are read-only via this endpoint",
        )

    try:
        new_row = await store.create_prompt_version(prompt_id, body.body)
    except LookupError:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return _prompt_to_response(new_row)


@router.patch(
    "/v1/prompts/{prompt_id}",
    response_model=PromptResponse,
    summary="Update prompt status (body changes go via POST /versions)",
    dependencies=[Depends(require_permission("prompts:write"))],
)
async def patch_prompt_route(
    prompt_id: UUID,
    body: PromptPatch,
    request: Request,
):
    caller_tenant = _get_caller_tenant_id(request)
    store = await get_prompt_store()

    existing = await store.get_prompt(prompt_id)
    if existing is None or not _visible_to(existing.tenant_id, caller_tenant):
        raise HTTPException(status_code=404, detail="Prompt not found")

    if existing.tenant_id is None and caller_tenant is not None:
        raise HTTPException(
            status_code=403,
            detail="Global prompts are read-only via this endpoint",
        )

    new_status = body.status
    if new_status is None:
        # No-op patch; just echo the row.
        return _prompt_to_response(existing)

    if new_status not in {"draft", "active", "deprecated"}:
        raise HTTPException(
            status_code=400,
            detail="status must be one of: draft, active, deprecated",
        )

    # PromptStore has no first-class status mutator; the LocalPg store
    # exposes the row directly via ``create_prompt_version`` which is too
    # heavy for a pure status flip. Fall back to a direct ORM update for
    # the local case. For Supabase, callers should use the supersession
    # flow; status-only patches are advisory here.
    from src.agents.local_pg_store import LocalPgPromptStore

    if isinstance(store, LocalPgPromptStore):
        from sqlalchemy import update as sa_update
        from src.database.connection import async_session_factory
        from src.database.models import AgosPrompt

        async with async_session_factory() as session:
            await session.execute(
                sa_update(AgosPrompt)
                .where(AgosPrompt.id == prompt_id)
                .values(status=new_status)
            )
            await session.commit()
        updated = await store.get_prompt(prompt_id)
        if updated is None:
            raise HTTPException(status_code=404, detail="Prompt not found")
        return _prompt_to_response(updated)

    raise HTTPException(
        status_code=501,
        detail="PATCH /v1/prompts/{id} is only implemented for the LocalPg backend; "
               "use POST /v1/prompts/{id}/versions for Supabase",
    )


@router.delete(
    "/v1/prompts/{prompt_id}",
    response_model=PromptResponse,
    summary="Soft-delete a prompt (status='deprecated')",
    dependencies=[Depends(require_permission("prompts:write"))],
)
async def delete_prompt_route(
    prompt_id: UUID,
    request: Request,
):
    """Soft-delete via status='deprecated'.

    Hard delete is avoided because prompts are append-only and may be
    referenced by ``_agos_agents.prompt_id`` rows. Deprecation preserves
    the supersession chain.
    """
    caller_tenant = _get_caller_tenant_id(request)
    store = await get_prompt_store()

    existing = await store.get_prompt(prompt_id)
    if existing is None or not _visible_to(existing.tenant_id, caller_tenant):
        raise HTTPException(status_code=404, detail="Prompt not found")

    if existing.tenant_id is None and caller_tenant is not None:
        raise HTTPException(
            status_code=403,
            detail="Global prompts are read-only via this endpoint",
        )

    # Same dispatch as PATCH — status flip via ORM for LocalPg.
    from src.agents.local_pg_store import LocalPgPromptStore

    if isinstance(store, LocalPgPromptStore):
        from sqlalchemy import update as sa_update
        from src.database.connection import async_session_factory
        from src.database.models import AgosPrompt

        async with async_session_factory() as session:
            await session.execute(
                sa_update(AgosPrompt)
                .where(AgosPrompt.id == prompt_id)
                .values(status="deprecated")
            )
            await session.commit()
        updated = await store.get_prompt(prompt_id)
        if updated is None:
            raise HTTPException(status_code=404, detail="Prompt not found")
        return _prompt_to_response(updated)

    raise HTTPException(
        status_code=501,
        detail="DELETE /v1/prompts/{id} is only implemented for the LocalPg backend",
    )
