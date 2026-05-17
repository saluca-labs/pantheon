"""POST /v1/agents/import — bulk agent.yaml import endpoint (W-H.2.f).

Accepts the unified agent.yaml schema documented in
:doc:`agent_yaml_schema.md` and atomically writes the (agent, prompt,
provider-keys, policy-cache) rows for each agent in a single DB
transaction per agent.

Behaviour summary:

  * Auth: ``agents:write`` permission (same RBAC as the H.2.c CRUD).
  * Body forms:
      1. multipart file upload (.yaml/.yml/.json), single or multiple files
      2. inline JSON ``{"agents": [...]}``
      3. inline ``Content-Type: text/yaml`` body (single or multi-document)
  * Validation: full schema first, all errors collected with JSONPath paths
    (e.g. ``agents[0].metadata.persona``). If ANY agent has a validation
    error, the request is rejected with 400 and NO writes occur.
  * Per-agent atomicity: each agent's writes (agent row, prompt row,
    provider keys, policy cache, audit log) happen inside a single
    SQLAlchemy session with commit-or-rollback semantics. If any sub-write
    fails, the entire agent's slice is rolled back.
  * Tenant scoping: caller's tenant_id is forced onto every row. If a
    payload includes ``metadata.tenant``, it must match the caller's
    tenant slug (resolved from ``_soul_tenants``); otherwise it's a
    validation error.

Locked decisions honoured:
  * #2 — agents keyed by (tenant_id, persona_id); update on conflict.
  * #3 — prompts append-only via supersedes_id chain.
  * #4 — plain-text prompts only (no templating).
  * #5 — provider_overrides.secret_ref must use a supported scheme;
         reserved schemes (vault://, gcpsm://, …) are rejected with a
         helpful validator message — NOT a 500.
"""

from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

import yaml
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.agents.import_schema import (
    AgentImportError,
    AgentImportItemResult,
    AgentImportPayload,
    AgentImportRequest,
    AgentImportResponse,
    AgentProviderOverride,
    format_validation_errors,
)
from src.agents.secret_ref import (
    SecretRefError,
    describe_secret_ref,
    resolve_secret_ref,
)
from src.auth.rbac import require_permission
from src.database.connection import async_session_factory
from src.database.models import (
    AgosAgent,
    AgosPrompt,
    AuditLog,
    PolicyCache,
    SoulTenant,
    TenantProviderKey,
)


router = APIRouter(tags=["Agents Import"])


# ---------------------------------------------------------------------------
# Caller-tenant helper (mirrors src.agents.crud_router._get_caller_tenant_id)
# ---------------------------------------------------------------------------


def _get_caller_tenant_id(request: Request) -> Optional[UUID]:
    soulkey = getattr(request.state, "rbac_soulkey", None)
    if soulkey is None:
        return None
    tid = getattr(soulkey, "tenant_id", None)
    if tid is None:
        return None
    return tid if isinstance(tid, UUID) else UUID(str(tid))


# ---------------------------------------------------------------------------
# Payload parsing (YAML / JSON / multipart)
# ---------------------------------------------------------------------------


def _parse_yaml_or_json(text: str, source: str) -> list[dict]:
    """Parse a string body into a list of agent dicts.

    Accepts:
      1. Inline JSON ``{"agents": [...]}`` → returns that list
      2. Single-document YAML matching the same shape
      3. Single-document YAML with a single agent at top level
         (``{metadata: ..., spec: ...}``) → wraps in a list of one
      4. Multi-document YAML stream (``---`` separators) — each document
         is a single agent

    Raises ``HTTPException(400)`` with a helpful message on parse error.
    """
    text = (text or "").strip()
    if not text:
        raise HTTPException(
            status_code=400,
            detail=f"empty payload from {source!r}",
        )

    # Try multi-document YAML first — safe_load_all handles single-doc too.
    try:
        documents = [d for d in yaml.safe_load_all(text) if d is not None]
    except yaml.YAMLError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"failed to parse {source!r} as YAML/JSON: {exc}",
        )

    if not documents:
        raise HTTPException(
            status_code=400,
            detail=f"no documents found in {source!r}",
        )

    # Single document — could be either {agents: [...]} or a single agent.
    if len(documents) == 1:
        doc = documents[0]
        if isinstance(doc, dict) and "agents" in doc and isinstance(doc["agents"], list):
            return doc["agents"]
        if isinstance(doc, dict):
            return [doc]
        raise HTTPException(
            status_code=400,
            detail=f"{source!r} top-level must be a mapping (single agent) "
                   f"or a mapping with 'agents: [...]'",
        )

    # Multi-document YAML stream → each doc is one agent.
    out: list[dict] = []
    for i, doc in enumerate(documents):
        if not isinstance(doc, dict):
            raise HTTPException(
                status_code=400,
                detail=f"{source!r} document {i} must be a mapping, got "
                       f"{type(doc).__name__}",
            )
        out.append(doc)
    return out


def _validate_secret_ref_scheme(
    ref: str, path: str
) -> Optional[AgentImportError]:
    """Validate ``secret_ref`` scheme support; returns AgentImportError or None.

    Mirrors :func:`src.agents.provider_keys_router._validate_secret_ref_or_400`
    but produces a structured error with ``path`` instead of raising 400.
    """
    info = describe_secret_ref(ref)
    try:
        resolve_secret_ref(ref)
        return None
    except NotImplementedError:
        scheme = info.get("scheme") or "?"
        return AgentImportError(
            path=path,
            message=(
                f"scheme {scheme!r}:// is reserved but not yet implemented "
                f"(only env:// is supported in this version)"
            ),
        )
    except SecretRefError:
        # env://NOT_SET is acceptable — the env var may be set later and
        # the operator can verify via POST /v1/provider-keys/{id}/test.
        scheme = info.get("scheme")
        if scheme == "env":
            return None
        if scheme in {"vault", "gcpsm", "awssm", "enc"}:
            return AgentImportError(
                path=path,
                message=(
                    f"scheme {scheme!r}:// is reserved but not yet "
                    f"implemented (only env:// is supported in this version)"
                ),
            )
        return AgentImportError(
            path=path,
            message=f"unknown or malformed secret-ref scheme: {scheme!r}",
        )


# ---------------------------------------------------------------------------
# Tenant resolution
# ---------------------------------------------------------------------------


async def _tenant_slug(
    session: AsyncSession, tenant_id: UUID
) -> Optional[str]:
    """Look up the caller's tenant slug for the metadata.tenant check."""
    row = (await session.execute(
        select(SoulTenant).where(SoulTenant.id == tenant_id)
    )).scalar_one_or_none()
    return row.slug if row else None


# ---------------------------------------------------------------------------
# Per-agent atomic write
# ---------------------------------------------------------------------------


def _build_resolved_policy_dict(
    payload: AgentImportPayload, tenant_slug: Optional[str]
) -> Optional[dict[str, Any]]:
    """Build the resolved-policy JSON for ``_soulauth_policy_cache``.

    Only emits a non-None dict when at least one of the policy-related
    spec blocks is present. Mirrors the shape that
    :class:`src.policy.loader.ResolvedPolicy.to_dict` emits so that the
    existing PDP picks it up unchanged.
    """
    spec = payload.spec
    has_policy = any([
        spec.model_policies is not None,
        spec.resources is not None,
        spec.jit is not None,
        spec.escalation is not None,
    ])
    if not has_policy:
        return None

    resolved: dict[str, Any] = {
        "metadata": {
            "tenant": tenant_slug or "",
            "persona": payload.metadata.persona,
            "role": payload.metadata.role or "",
            "description": payload.metadata.description or "",
        },
        "spec": {},
    }
    out_spec = resolved["spec"]
    if spec.jit is not None:
        out_spec["jit"] = dict(spec.jit)
    if spec.escalation is not None:
        out_spec["escalation"] = dict(spec.escalation)
    if spec.resources is not None:
        out_spec["resources"] = dict(spec.resources)
    if spec.model_policies is not None:
        out_spec["model_policies"] = spec.model_policies.model_dump(
            exclude_none=False
        )
    return resolved


async def _import_one_agent(
    payload: AgentImportPayload,
    caller_tenant_id: UUID,
    tenant_slug: Optional[str],
) -> AgentImportItemResult:
    """Atomically import a single agent — agent + prompt + provider keys + policy.

    Each call opens its OWN session and commits or rolls back as a unit.
    If any write inside this function fails, no row from this agent
    persists. Other agents in the same bulk request are unaffected (their
    own atomic slice already committed or will run independently).
    """
    persona_id = payload.metadata.persona

    async with async_session_factory() as session:
        try:
            # ---- 1. agent: upsert by (tenant_id, persona_id) ----
            existing_agent = (await session.execute(
                select(AgosAgent).where(
                    AgosAgent.tenant_id == caller_tenant_id,
                    AgosAgent.persona_id == persona_id,
                )
            )).scalar_one_or_none()

            display_name = payload.metadata.name or persona_id
            description = payload.metadata.description
            agent_metadata: dict[str, Any] = {}
            if payload.metadata.tags:
                agent_metadata["tags"] = list(payload.metadata.tags)
            if payload.metadata.role:
                agent_metadata["role"] = payload.metadata.role

            created = existing_agent is None
            if created:
                agent_row = AgosAgent(
                    id=_uuid.uuid4(),
                    tenant_id=caller_tenant_id,
                    persona_id=persona_id,
                    name=display_name,
                    description=description,
                    prompt_id=None,
                    metadata_=agent_metadata,
                    status="active",
                )
                session.add(agent_row)
                await session.flush()
            else:
                agent_row = existing_agent
                agent_row.name = display_name
                if description is not None:
                    agent_row.description = description
                # Merge metadata rather than overwriting unrelated keys.
                merged = dict(agent_row.metadata_ or {})
                merged.update(agent_metadata)
                agent_row.metadata_ = merged
                agent_row.updated_at = datetime.now(timezone.utc)

            # ---- 2. prompt (optional, append-as-version on name match) ----
            new_prompt_id: Optional[UUID] = None
            if payload.spec.prompt is not None:
                p = payload.spec.prompt
                latest = (await session.execute(
                    select(AgosPrompt).where(
                        AgosPrompt.tenant_id == caller_tenant_id,
                        AgosPrompt.name == p.name,
                    ).order_by(AgosPrompt.version.desc()).limit(1)
                )).scalar_one_or_none()

                if latest is None:
                    new_prompt = AgosPrompt(
                        id=_uuid.uuid4(),
                        tenant_id=caller_tenant_id,
                        name=p.name,
                        body=p.body,
                        version=1,
                        supersedes_id=None,
                        status=p.status or "active",
                        metadata_={},
                    )
                    session.add(new_prompt)
                    await session.flush()
                    new_prompt_id = new_prompt.id
                else:
                    if latest.body == p.body:
                        # Body unchanged — reuse the latest row instead of
                        # spawning a no-op version. Just point the agent at it
                        # and re-activate if needed.
                        if latest.status != "active":
                            latest.status = "active"
                        new_prompt_id = latest.id
                    else:
                        # Append a new version that supersedes the latest.
                        new_prompt = AgosPrompt(
                            id=_uuid.uuid4(),
                            tenant_id=caller_tenant_id,
                            name=p.name,
                            body=p.body,
                            version=(latest.version or 1) + 1,
                            supersedes_id=latest.id,
                            status=p.status or "active",
                            metadata_=dict(latest.metadata_ or {}),
                        )
                        latest.status = "deprecated"
                        session.add(new_prompt)
                        await session.flush()
                        new_prompt_id = new_prompt.id

                agent_row.prompt_id = new_prompt_id

            # ---- 3. provider_overrides (upsert each by (tenant, provider)) ----
            keys_created = 0
            if payload.spec.provider_overrides:
                for override in payload.spec.provider_overrides:
                    existing_key = (await session.execute(
                        select(TenantProviderKey).where(
                            TenantProviderKey.tenant_id == caller_tenant_id,
                            TenantProviderKey.provider == override.provider,
                        )
                    )).scalar_one_or_none()

                    if existing_key is None:
                        key_row = TenantProviderKey(
                            id=_uuid.uuid4(),
                            tenant_id=caller_tenant_id,
                            provider=override.provider,
                            secret_ref=override.secret_ref,
                            base_url=override.base_url,
                            status=override.status or "active",
                            metadata_={},
                        )
                        session.add(key_row)
                    else:
                        existing_key.secret_ref = override.secret_ref
                        existing_key.base_url = override.base_url
                        existing_key.status = override.status or "active"
                        existing_key.updated_at = datetime.now(timezone.utc)
                    keys_created += 1
                await session.flush()

            # ---- 4. policy cache (upsert by (tenant_id, persona_id)) ----
            policy_synced = False
            resolved_policy = _build_resolved_policy_dict(payload, tenant_slug)
            if resolved_policy is not None:
                # Dialect-agnostic upsert: try INSERT, fall back to UPDATE
                # if (tenant_id, persona_id) already exists. Avoids the
                # PG-only on_conflict_do_update path the policy loader
                # uses, which doesn't run on the SQLite test harness.
                existing_policy = (await session.execute(
                    select(PolicyCache).where(
                        PolicyCache.tenant_id == caller_tenant_id,
                        PolicyCache.persona_id == persona_id,
                    )
                )).scalar_one_or_none()
                now = datetime.now(timezone.utc)
                if existing_policy is None:
                    session.add(PolicyCache(
                        id=_uuid.uuid4(),
                        tenant_id=caller_tenant_id,
                        persona_id=persona_id,
                        policy_version="import",
                        resolved_policy=resolved_policy,
                        synced_at=now,
                    ))
                else:
                    existing_policy.policy_version = "import"
                    existing_policy.resolved_policy = resolved_policy
                    existing_policy.synced_at = now
                policy_synced = True

            # ---- 5. audit log ----
            session.add(AuditLog(
                id=_uuid.uuid4(),
                tenant_id=caller_tenant_id,
                timestamp=datetime.now(timezone.utc),
                event_type="policy_synced",  # nearest existing valid type
                persona_id=persona_id,
                resource="agent",
                action="import",
                decision="allow",
                reason="agent.yaml import (W-H.2.f)",
                context={
                    "created": created,
                    "agent_id": str(agent_row.id),
                    "prompt_id": str(new_prompt_id) if new_prompt_id else None,
                    "provider_keys_upserted": keys_created,
                    "policy_synced": policy_synced,
                },
            ))

            await session.commit()
            return AgentImportItemResult(
                persona_id=persona_id,
                agent_id=str(agent_row.id),
                prompt_id=str(new_prompt_id) if new_prompt_id else None,
                provider_keys_created=keys_created,
                policy_synced=policy_synced,
                created=created,
            )
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# Cross-payload validation (after pydantic shape-check passes)
# ---------------------------------------------------------------------------


def _semantic_errors(
    payloads: list[AgentImportPayload],
    caller_tenant_slug: Optional[str],
) -> list[AgentImportError]:
    """Run cross-field / context-dependent validation that pydantic can't.

    * ``metadata.tenant`` must match caller's slug if both are present.
    * ``provider_overrides[*].secret_ref`` scheme must be supported.
    """
    errors: list[AgentImportError] = []
    for i, payload in enumerate(payloads):
        prefix = f"agents[{i}]"

        # Tenant slug check
        if (
            payload.metadata.tenant
            and caller_tenant_slug
            and payload.metadata.tenant != caller_tenant_slug
        ):
            errors.append(AgentImportError(
                path=f"{prefix}.metadata.tenant",
                message=(
                    f"{payload.metadata.tenant!r} does not match caller "
                    f"tenant {caller_tenant_slug!r}"
                ),
            ))

        # Secret-ref scheme check
        if payload.spec.provider_overrides:
            for j, ov in enumerate(payload.spec.provider_overrides):
                err = _validate_secret_ref_scheme(
                    ov.secret_ref,
                    path=f"{prefix}.spec.provider_overrides[{j}].secret_ref",
                )
                if err is not None:
                    errors.append(err)
    return errors


# ---------------------------------------------------------------------------
# Validation entry point — shape (pydantic) + semantic
# ---------------------------------------------------------------------------


def _validate_payloads(
    raw_docs: list[dict],
) -> tuple[list[AgentImportPayload], list[AgentImportError]]:
    """Run pydantic validation on each document; collect all errors.

    Returns ``(valid_payloads, errors)`` — even on partial success, valid
    payloads are returned so callers can decide whether to surface them
    (e.g. ``dry_run=true`` preview). The router itself enforces
    all-or-nothing on errors.
    """
    payloads: list[AgentImportPayload] = []
    errors: list[AgentImportError] = []
    for i, doc in enumerate(raw_docs):
        prefix = f"agents[{i}]"
        try:
            payloads.append(AgentImportPayload.model_validate(doc))
        except ValidationError as exc:
            errors.extend(format_validation_errors(exc, path_prefix=prefix))
    return payloads, errors


# ---------------------------------------------------------------------------
# Body extraction (multipart + JSON + raw YAML)
# ---------------------------------------------------------------------------


async def _extract_docs(request: Request, files: list[UploadFile]) -> list[dict]:
    """Pull raw agent dicts out of the request.

    Priority order:
      1. ``files=[...]`` multipart attachments (one or many)
      2. ``Content-Type: text/yaml`` (or application/yaml) → raw body parsed
      3. ``Content-Type: application/json`` → JSON body (matches
         :class:`AgentImportRequest` shape, or a bare single-agent map)
    """
    if files:
        docs: list[dict] = []
        for f in files:
            content = (await f.read()).decode("utf-8", errors="replace")
            docs.extend(_parse_yaml_or_json(content, source=f.filename or "upload"))
        return docs

    ctype = (request.headers.get("content-type") or "").lower().split(";", 1)[0].strip()
    if ctype in ("text/yaml", "application/yaml", "application/x-yaml", "text/x-yaml"):
        body = (await request.body()).decode("utf-8", errors="replace")
        return _parse_yaml_or_json(body, source="request-body")

    # Default to JSON.
    try:
        body = await request.json()
    except Exception:
        # Fall back: try the body as YAML (allows curl --data-binary @file.yaml
        # without setting Content-Type).
        raw = (await request.body()).decode("utf-8", errors="replace")
        if raw.strip():
            return _parse_yaml_or_json(raw, source="request-body")
        raise HTTPException(
            status_code=400,
            detail="missing request body — expected JSON, multipart file upload, or YAML",
        )

    if isinstance(body, dict) and "agents" in body and isinstance(body["agents"], list):
        return list(body["agents"])
    if isinstance(body, dict):
        return [body]
    if isinstance(body, list):
        return list(body)
    raise HTTPException(
        status_code=400,
        detail="JSON body must be an object with 'agents' list, a single "
               "agent object, or a list of agent objects",
    )


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.post(
    "/v1/agents/import",
    response_model=AgentImportResponse,
    summary="Import agents from agent.yaml (bulk, atomic per agent)",
    dependencies=[Depends(require_permission("agents:write"))],
    responses={
        400: {"description": "Validation errors (per-field paths in 'errors' list)"},
    },
)
async def import_agents_route(
    request: Request,
    files: list[UploadFile] = File(default=[]),
    dry_run: bool = Query(
        False,
        description="When true, validate but do not write. Useful for the preview pane.",
    ),
) -> AgentImportResponse:
    """Bulk-import the agent.yaml schema documented in ``agent_yaml_schema.md``.

    Accepts multipart file upload (yaml/yml/json), inline JSON, or raw
    YAML body. Always tenant-scoped: ``metadata.tenant`` (if present)
    must match the caller's tenant slug.
    """
    caller_tenant_id = _get_caller_tenant_id(request)
    if caller_tenant_id is None:
        raise HTTPException(
            status_code=401,
            detail="caller tenant context required for agent import",
        )

    # Pull raw agent dicts out of the request body.
    raw_docs = await _extract_docs(request, files)
    if not raw_docs:
        raise HTTPException(
            status_code=400,
            detail="no agent documents found in payload",
        )

    # Resolve caller's tenant slug for the metadata.tenant check.
    async with async_session_factory() as session:
        caller_slug = await _tenant_slug(session, caller_tenant_id)

    # Shape (pydantic) validation.
    payloads, shape_errors = _validate_payloads(raw_docs)

    # Semantic (cross-field) validation — only over payloads that passed
    # the shape gate (others are already reported).
    semantic_errors = _semantic_errors(payloads, caller_slug)

    errors = shape_errors + semantic_errors
    if errors:
        # All-or-nothing: any validation error short-circuits before writes.
        return AgentImportResponse(imported=[], errors=errors)

    if dry_run:
        # Preview mode: report what WOULD be imported without writing.
        return AgentImportResponse(
            imported=[
                AgentImportItemResult(
                    persona_id=p.metadata.persona,
                    agent_id="(dry-run)",
                    prompt_id=("(dry-run)" if p.spec.prompt else None),
                    provider_keys_created=len(p.spec.provider_overrides or []),
                    policy_synced=any([
                        p.spec.model_policies, p.spec.resources,
                        p.spec.jit, p.spec.escalation,
                    ]),
                    created=True,  # unknown without a probe — preview reports as create
                )
                for p in payloads
            ],
            errors=[],
        )

    imported: list[AgentImportItemResult] = []
    for i, payload in enumerate(payloads):
        try:
            result = await _import_one_agent(payload, caller_tenant_id, caller_slug)
            imported.append(result)
        except Exception as exc:
            # An unexpected write-time failure (DB constraint, network blip).
            # Surface it as a structured error rather than a 500 so the UI
            # can show which agent failed.
            return AgentImportResponse(
                imported=imported,
                errors=[AgentImportError(
                    path=f"agents[{i}]",
                    message=f"import failed: {type(exc).__name__}: {exc}",
                )],
            )

    return AgentImportResponse(imported=imported, errors=[])
