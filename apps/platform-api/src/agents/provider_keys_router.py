"""Per-tenant provider keys CRUD endpoints (Wave H.2.e BYOK).

Surfaces the :mod:`src.agents.provider_keys_store` over HTTP. All
endpoints are tenant-scoped via the same ``_get_caller_tenant_id``
pattern as :mod:`src.agents.crud_router` (W-H.2.c). Cross-tenant access
returns 404 (not 403) to avoid leaking row existence.

Endpoints (RBAC permission shown in brackets):

  GET    /v1/provider-keys                  [providers:read]
      List the caller's per-tenant provider key overrides. secret_ref
      is returned in MASKED form (scheme + last segment only); the
      resolved secret value is NEVER echoed in any response.

  GET    /v1/provider-keys/{id}             [providers:read]
      Get one by id. Cross-tenant → 404.

  POST   /v1/provider-keys                  [providers:write]
      Create or upsert a key for (tenant, provider). Validates that
      :func:`src.agents.secret_ref.resolve_secret_ref` accepts the
      URI scheme BEFORE saving — unsupported schemes (vault://, etc.)
      surface as 400 because the row would never resolve successfully.

  PATCH  /v1/provider-keys/{id}             [providers:write]
      Update mutable fields (secret_ref, base_url, status, metadata).

  DELETE /v1/provider-keys/{id}             [providers:write]
      Hard-delete by id.

  POST   /v1/provider-keys/{id}/test        [providers:read]
      Health-check: resolve the secret + make a minimal probe call to
      the provider's API. Returns ``{ok, latency_ms, error?}``. NEVER
      echoes the resolved secret in the response or logs.

Locked decisions:
  * #5 — secret-ref only (no plaintext); validation at write-time, but
    deferred resolution at read-time (env vars can come and go without
    breaking stored rows).
"""

from __future__ import annotations

import time
import uuid
from typing import Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from src.agents.provider_keys_store import (
    SUPPORTED_PROVIDERS,
    TenantProviderKey,
    delete_tenant_provider_key,
    get_tenant_provider_key,
    list_tenant_provider_keys,
    update_tenant_provider_key,
    upsert_tenant_provider_key,
)
from src.agents.secret_ref import (
    SecretRefError,
    describe_secret_ref,
    resolve_secret_ref,
)
from src.auth.rbac import require_permission


router = APIRouter(tags=["Provider Keys (BYOK)"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_caller_tenant_id(request: Request) -> Optional[UUID]:
    """Read caller tenant_id off the auth-context soulkey.

    Mirrors the identically-named helper in
    :mod:`src.agents.crud_router` — kept local to avoid a cross-module
    import that would make this router depend on the agents CRUD module.
    """
    soulkey = getattr(request.state, "rbac_soulkey", None)
    if soulkey is None:
        return None
    tid = getattr(soulkey, "tenant_id", None)
    if tid is None:
        return None
    return tid if isinstance(tid, UUID) else UUID(str(tid))


def _mask_secret_ref(ref: str) -> str:
    """Public-safe view of the secret URI.

    Shows the scheme + the variable name (e.g. ``env://ANTHROPIC_KEY``)
    — these are public identifiers, NOT the resolved value. The
    resolved secret is NEVER part of any wire response.
    """
    return ref or ""


def _validate_provider(provider: str) -> str:
    p = (provider or "").lower().strip()
    if p not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"provider must be one of: {list(SUPPORTED_PROVIDERS)}",
        )
    return p


def _validate_secret_ref_or_400(ref: str) -> None:
    """Reject obviously-unusable secret refs at write-time.

    We attempt to resolve the URI. If the scheme is reserved-but-unimplemented
    (vault://, gcpsm://, etc.) we surface 400 because the row would
    permanently fail to resolve. If resolution fails because the env var
    is not set (env://NOT_SET), we ACCEPT — the operator may set the
    var later, and they can verify via /test.
    """
    try:
        resolve_secret_ref(ref)
    except NotImplementedError as e:
        raise HTTPException(
            status_code=400,
            detail=f"unsupported secret-ref scheme: {e}",
        )
    except SecretRefError as e:
        # Distinguish "malformed/unknown scheme" (reject) from
        # "env var not set yet" (accept — deferred resolution).
        info = describe_secret_ref(ref)
        if info["scheme"] in (None,) or not info["valid"]:
            raise HTTPException(
                status_code=400,
                detail=f"invalid secret ref: {e}",
            )
        if info["scheme"] not in ("env", "vault", "gcpsm", "awssm", "enc"):
            raise HTTPException(
                status_code=400,
                detail=f"unknown secret-ref scheme: {info['scheme']!r}",
            )
        # env://NOT_YET_SET — accept, /test will report failure later.
        return


# ---------------------------------------------------------------------------
# Wire models
# ---------------------------------------------------------------------------


class ProviderKeyResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    provider: str
    secret_ref: str = Field(
        ...,
        description="platform_secrets URI (e.g. env://VAR). "
                    "The resolved value is NEVER returned.",
    )
    base_url: Optional[str]
    status: str
    metadata: dict
    created_at: str
    updated_at: str
    created_by: Optional[UUID]


class ProviderKeyCreate(BaseModel):
    provider: str = Field(..., description=f"One of: {list(SUPPORTED_PROVIDERS)}")
    secret_ref: str = Field(
        ...,
        description="platform_secrets URI; minimum supported scheme: env://VAR_NAME",
    )
    base_url: Optional[str] = Field(
        None,
        description="Optional provider base URL override "
                    "(Azure endpoint, Ollama host, custom inference URL)",
    )
    status: Optional[str] = Field("active", description="active | disabled")
    metadata: Optional[dict] = Field(default_factory=dict)


class ProviderKeyPatch(BaseModel):
    secret_ref: Optional[str] = None
    base_url: Optional[str] = None
    status: Optional[str] = None
    metadata: Optional[dict] = None


class ProviderKeyTestRequest(BaseModel):
    """Inline test (no row required). Used by the 'Add Override' modal
    in the portal so users can verify a key works before saving."""
    provider: str
    secret_ref: str
    base_url: Optional[str] = None


class ProviderKeyTestResponse(BaseModel):
    ok: bool
    latency_ms: int
    error: Optional[str] = None
    # Echo back the scheme/target description so the UI can render a
    # mask. NEVER echoes the resolved secret value itself.
    secret_ref_info: Optional[dict] = None


# ---------------------------------------------------------------------------
# Dataclass → response
# ---------------------------------------------------------------------------


def _to_response(row: TenantProviderKey) -> ProviderKeyResponse:
    return ProviderKeyResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        provider=row.provider,
        secret_ref=_mask_secret_ref(row.secret_ref),
        base_url=row.base_url,
        status=row.status,
        metadata=dict(row.metadata or {}),
        created_at=row.created_at or "",
        updated_at=row.updated_at or "",
        created_by=row.created_by,
    )


# ---------------------------------------------------------------------------
# Probe (minimal call to the provider) — used by POST /test endpoints
# ---------------------------------------------------------------------------


# Per-provider HEAD/GET probe targets. We deliberately use cheap, side-effect-free
# endpoints (model list / health) so /test doesn't burn quota. The probe just
# needs to confirm the API key is recognized by the upstream.
_PROBE_TARGETS: dict[str, tuple[str, str]] = {
    # (path appended to base, header style)
    "openai":    ("/v1/models",       "bearer"),
    "anthropic": ("/v1/models",       "anthropic"),  # /v1/models requires x-api-key + anthropic-version
    "gemini":    ("/v1beta/models",   "google_query"),
    "groq":      ("/openai/v1/models", "bearer"),
    "ollama":    ("/api/tags",        "none"),       # ollama is typically unauthed
}

_DEFAULT_BASE_MAP_PROBE: dict[str, str] = {
    "openai":    "https://api.openai.com",
    "anthropic": "https://api.anthropic.com",
    "gemini":    "https://generativelanguage.googleapis.com",
    "groq":      "https://api.groq.com",
    "ollama":    "http://localhost:11434",
}


async def _probe_provider(
    provider: str, api_key: str, base_url: Optional[str]
) -> ProviderKeyTestResponse:
    """Make a single low-cost probe call to verify the credential works.

    Strict timeout, retries=0, no logging of the secret. Failure modes
    are flattened into ``{ok: False, error: <short string>}`` — we never
    echo the api_key or HTTP body contents back to the client.
    """
    t0 = time.perf_counter()
    if provider not in _PROBE_TARGETS:
        return ProviderKeyTestResponse(
            ok=False,
            latency_ms=0,
            error=f"unknown provider: {provider}",
        )

    path, auth_style = _PROBE_TARGETS[provider]
    base = (base_url or _DEFAULT_BASE_MAP_PROBE[provider]).rstrip("/")
    url = f"{base}{path}"

    headers: dict[str, str] = {}
    params: dict[str, str] = {}
    if auth_style == "bearer":
        headers["Authorization"] = f"Bearer {api_key}"
    elif auth_style == "anthropic":
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = "2023-06-01"
    elif auth_style == "google_query":
        params["key"] = api_key
    # "none" → no auth

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(url, headers=headers, params=params)
        latency = int((time.perf_counter() - t0) * 1000)
        # Treat 2xx as ok; 401/403 → auth failure; anything else → upstream error.
        if 200 <= r.status_code < 300:
            return ProviderKeyTestResponse(ok=True, latency_ms=latency)
        if r.status_code in (401, 403):
            return ProviderKeyTestResponse(
                ok=False,
                latency_ms=latency,
                error=f"auth rejected (HTTP {r.status_code})",
            )
        return ProviderKeyTestResponse(
            ok=False,
            latency_ms=latency,
            error=f"upstream returned HTTP {r.status_code}",
        )
    except httpx.TimeoutException:
        return ProviderKeyTestResponse(
            ok=False,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            error="timeout",
        )
    except Exception as exc:
        # NOTE: deliberately use type name + a short string only — we
        # never include the api_key or arbitrary upstream payload here.
        return ProviderKeyTestResponse(
            ok=False,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            error=f"{type(exc).__name__}",
        )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get(
    "/v1/provider-keys",
    response_model=list[ProviderKeyResponse],
    summary="List the caller's per-tenant provider key overrides",
    dependencies=[Depends(require_permission("providers:read"))],
)
async def list_provider_keys_route(
    request: Request,
    provider: Optional[str] = Query(None, description="Filter by provider"),
):
    caller_tenant = _get_caller_tenant_id(request)
    if caller_tenant is None:
        # No tenant context → return empty rather than 401 — RBAC has
        # already gate-checked the call.
        return []
    rows = await list_tenant_provider_keys(caller_tenant, provider=provider)
    return [_to_response(r) for r in rows]


@router.post(
    "/v1/provider-keys",
    response_model=ProviderKeyResponse,
    summary="Create or upsert a per-tenant provider key",
    dependencies=[Depends(require_permission("providers:write"))],
)
async def create_provider_key_route(
    request: Request,
    body: ProviderKeyCreate,
):
    caller_tenant = _get_caller_tenant_id(request)
    if caller_tenant is None:
        raise HTTPException(
            status_code=401,
            detail="caller tenant context required to create provider keys",
        )

    provider_norm = _validate_provider(body.provider)
    _validate_secret_ref_or_400(body.secret_ref)

    status = (body.status or "active").lower()
    if status not in ("active", "disabled"):
        raise HTTPException(
            status_code=400,
            detail="status must be 'active' or 'disabled'",
        )

    saved = await upsert_tenant_provider_key(
        tenant_id=caller_tenant,
        provider=provider_norm,
        secret_ref=body.secret_ref,
        base_url=body.base_url,
        status=status,
        metadata=dict(body.metadata or {}),
        created_by=None,
    )
    return _to_response(saved)


@router.get(
    "/v1/provider-keys/{key_id}",
    response_model=ProviderKeyResponse,
    summary="Get one provider key by id",
    dependencies=[Depends(require_permission("providers:read"))],
)
async def get_provider_key_route(key_id: UUID, request: Request):
    caller_tenant = _get_caller_tenant_id(request)
    row = await get_tenant_provider_key(key_id)
    if row is None:
        raise HTTPException(status_code=404, detail="provider key not found")
    if caller_tenant is not None and row.tenant_id != caller_tenant:
        # Cross-tenant → 404 (don't leak existence)
        raise HTTPException(status_code=404, detail="provider key not found")
    return _to_response(row)


@router.patch(
    "/v1/provider-keys/{key_id}",
    response_model=ProviderKeyResponse,
    summary="Update mutable fields of a provider key",
    dependencies=[Depends(require_permission("providers:write"))],
)
async def patch_provider_key_route(
    key_id: UUID,
    body: ProviderKeyPatch,
    request: Request,
):
    caller_tenant = _get_caller_tenant_id(request)
    existing = await get_tenant_provider_key(key_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="provider key not found")
    if caller_tenant is not None and existing.tenant_id != caller_tenant:
        raise HTTPException(status_code=404, detail="provider key not found")

    patch = body.model_dump(exclude_unset=True, exclude_none=False)

    # Drop explicit Nones for fields that don't accept None (status, secret_ref)
    if "status" in patch and patch["status"] is None:
        patch.pop("status")
    if "secret_ref" in patch and patch["secret_ref"] is None:
        patch.pop("secret_ref")
    if "metadata" in patch and patch["metadata"] is None:
        patch.pop("metadata")
    # base_url IS allowed to be None (means "clear the override")

    if "secret_ref" in patch:
        _validate_secret_ref_or_400(patch["secret_ref"])
    if "status" in patch and patch["status"] not in ("active", "disabled"):
        raise HTTPException(
            status_code=400,
            detail="status must be 'active' or 'disabled'",
        )

    updated = await update_tenant_provider_key(key_id, patch)
    if updated is None:
        raise HTTPException(status_code=404, detail="provider key not found")
    return _to_response(updated)


@router.delete(
    "/v1/provider-keys/{key_id}",
    summary="Hard-delete a provider key",
    dependencies=[Depends(require_permission("providers:write"))],
)
async def delete_provider_key_route(key_id: UUID, request: Request):
    caller_tenant = _get_caller_tenant_id(request)
    existing = await get_tenant_provider_key(key_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="provider key not found")
    if caller_tenant is not None and existing.tenant_id != caller_tenant:
        raise HTTPException(status_code=404, detail="provider key not found")
    ok = await delete_tenant_provider_key(key_id)
    return {"deleted": bool(ok), "id": str(key_id)}


@router.post(
    "/v1/provider-keys/{key_id}/test",
    response_model=ProviderKeyTestResponse,
    summary="Test a stored provider key — resolve + probe upstream",
    dependencies=[Depends(require_permission("providers:read"))],
)
async def test_provider_key_route(key_id: UUID, request: Request):
    caller_tenant = _get_caller_tenant_id(request)
    row = await get_tenant_provider_key(key_id)
    if row is None:
        raise HTTPException(status_code=404, detail="provider key not found")
    if caller_tenant is not None and row.tenant_id != caller_tenant:
        raise HTTPException(status_code=404, detail="provider key not found")

    info = describe_secret_ref(row.secret_ref)
    try:
        api_key = resolve_secret_ref(row.secret_ref)
    except (SecretRefError, NotImplementedError) as exc:
        return ProviderKeyTestResponse(
            ok=False,
            latency_ms=0,
            error=f"secret_ref resolution failed: {exc}",
            secret_ref_info=info,
        )

    result = await _probe_provider(row.provider, api_key, row.base_url)
    result.secret_ref_info = info
    return result


@router.post(
    "/v1/provider-keys/test",
    response_model=ProviderKeyTestResponse,
    summary="Test an inline (provider, secret_ref) tuple without saving",
    dependencies=[Depends(require_permission("providers:read"))],
)
async def test_inline_provider_key_route(
    body: ProviderKeyTestRequest,
    request: Request,
):
    """Used by the 'Add Override' modal so users can verify the key works
    before saving the row."""
    provider_norm = _validate_provider(body.provider)
    info = describe_secret_ref(body.secret_ref)
    try:
        api_key = resolve_secret_ref(body.secret_ref)
    except (SecretRefError, NotImplementedError) as exc:
        return ProviderKeyTestResponse(
            ok=False,
            latency_ms=0,
            error=f"secret_ref resolution failed: {exc}",
            secret_ref_info=info,
        )
    result = await _probe_provider(provider_norm, api_key, body.base_url)
    result.secret_ref_info = info
    return result
