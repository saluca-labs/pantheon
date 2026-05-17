"""HTTP surface for agents-store configuration (W-H.2.b).

Three endpoints, all admin-scoped via the standard SoulAuth permission check
that the existing ``/v1/soulauth/admin/*`` routes use. The portal proxies
these via ``/api/agents-store/*`` thin Next.js routes.

  GET  /v1/agents-store/config   → current kind + masked config
  POST /v1/agents-store/config   → upsert kind + config (validates URI ref)
  POST /v1/agents-store/test     → run health_check against PROPOSED config
                                    (without persisting it)

Per locked decision #5, the raw service-role key is NEVER echoed back —
GET returns only the URI scheme + variable name, never the resolved value.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from src.agents.config import get_agents_store_config, set_agents_store_config
from src.agents.factory import FactoryError, get_agent_store
from src.agents.secret_ref import describe_secret_ref
from src.auth.rbac import require_permission


router = APIRouter(prefix="/v1/agents-store", tags=["Agents Store"])


# ---------------------------------------------------------------------------
# Wire schemas
# ---------------------------------------------------------------------------


class _LocalConfig(BaseModel):
    pass


class _SupabaseConfig(BaseModel):
    url: str = Field(..., description="https://xxxxx.supabase.co")
    service_role_key_ref: str = Field(
        ..., description="Secret URI, e.g. env://SUPABASE_SERVICE_ROLE_KEY"
    )


class ConfigPayload(BaseModel):
    """POST body for upserting the agents-store config."""
    kind: str = Field(..., description="local | supabase")
    config: dict = Field(default_factory=dict)


class TestPayload(BaseModel):
    """POST body for testing a proposed (but-not-saved) configuration."""
    kind: str = Field(..., description="local | supabase")
    config: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mask_config(kind: str, config: dict) -> dict:
    """Public-safe view of the config payload.

    The raw service-role key is NEVER stored in `config` (only a secret
    URI ref is), but to be extra defensive we explicitly walk the known
    shape and surface only the URI metadata via describe_secret_ref.
    """
    if kind == "local":
        return {}
    if kind == "supabase":
        ref = config.get("service_role_key_ref")
        return {
            "url": config.get("url"),
            "service_role_key_ref": {
                "raw": ref,                              # the URI itself is safe — it's just a pointer
                **describe_secret_ref(ref),
            },
        }
    return dict(config or {})


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get(
    "/config",
    summary="Get the current agents-store configuration",
    dependencies=[Depends(require_permission("policy:read"))],
)
async def get_config_route() -> dict:
    kind, config = await get_agents_store_config()
    return {
        "kind": kind,
        "config": _mask_config(kind, config),
    }


@router.post(
    "/config",
    summary="Update the agents-store configuration",
    dependencies=[Depends(require_permission("policy:sync"))],
)
async def set_config_route(payload: ConfigPayload) -> dict:
    # Validate the proposed config builds cleanly before persisting.
    try:
        # Build (but don't use) a store to surface any URI-resolution errors.
        await get_agent_store(kind=payload.kind, config=payload.config)
    except FactoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotImplementedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"invalid config: {e}")

    try:
        await set_agents_store_config(payload.kind, payload.config)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    kind, config = await get_agents_store_config()
    return {
        "kind": kind,
        "config": _mask_config(kind, config),
        "saved": True,
    }


@router.post(
    "/test",
    summary="Health-check a proposed agents-store configuration (does NOT save)",
    dependencies=[Depends(require_permission("policy:read"))],
)
async def test_config_route(payload: TestPayload) -> dict:
    try:
        store = await get_agent_store(kind=payload.kind, config=payload.config)
    except FactoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotImplementedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    health = await store.health_check()
    return {
        "kind": payload.kind,
        "health": health,
    }
