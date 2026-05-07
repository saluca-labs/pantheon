"""Admin endpoints — plugin listing, policy reload, and policy validation."""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app_proxy.auth.middleware import verify_admin_key
from app_proxy.config import Settings
from app_proxy.main import get_cedar_engine, get_plugin_registry, get_settings
from app_proxy.plugins.registry import PluginRegistry

logger = structlog.stdlib.get_logger("app_proxy.routers.admin")

router = APIRouter(prefix="/v1/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------
def _require_admin(request: Request) -> None:
    settings = get_settings()
    verify_admin_key(request, settings)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------
class PluginSummary(BaseModel):
    name: str
    version: str
    mcp_server_type: str
    tools: int
    healthy: bool
    last_health_check: str | None = None


class PluginListResponse(BaseModel):
    plugins: list[PluginSummary]


class PluginHealthResult(BaseModel):
    plugin: str
    healthy: bool


class PluginHealthResponse(BaseModel):
    results: list[PluginHealthResult]
    healthy_count: int
    total_count: int


class PolicyReloadResponse(BaseModel):
    status: str = "ok"
    policies_loaded: int = 0
    message: str = ""


class PolicyValidationError(BaseModel):
    file: str = ""
    line: int | None = None
    message: str = ""


class PolicyValidateResponse(BaseModel):
    valid: bool
    errors: list[PolicyValidationError] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("/plugins", response_model=PluginListResponse)
async def list_plugins(
    _admin: None = Depends(_require_admin),
) -> PluginListResponse:
    """List all registered plugins with status."""
    registry = get_plugin_registry()
    if not isinstance(registry, PluginRegistry):
        return PluginListResponse(plugins=[])

    return PluginListResponse(
        plugins=[PluginSummary(**p) for p in registry.list_plugins()]
    )


@router.post("/policies/reload", response_model=PolicyReloadResponse)
async def reload_policies(
    _admin: None = Depends(_require_admin),
) -> PolicyReloadResponse:
    """Force a Cedar policy reload from disk."""
    cedar_engine = get_cedar_engine()
    settings = get_settings()

    if isinstance(cedar_engine, dict):
        # Stub mode — simulate reload
        policies_dir = settings.policies_dir
        cedar_files = list(policies_dir.rglob("*.cedar")) if policies_dir.is_dir() else []
        logger.info("policies.reload.stub", count=len(cedar_files))
        return PolicyReloadResponse(
            status="ok",
            policies_loaded=len(cedar_files),
            message="Stub reload — real Cedar engine not wired yet",
        )

    try:
        cedar_engine.reload()
        errors = cedar_engine.validate()
        cedar_files = list(settings.policies_dir.rglob("*.cedar")) if settings.policies_dir.is_dir() else []
        logger.info("policies.reload.ok", count=len(cedar_files), errors=len(errors))
        return PolicyReloadResponse(
            status="ok" if not errors else "warning",
            policies_loaded=len(cedar_files),
            message="Policies reloaded successfully" if not errors else f"{len(errors)} validation error(s)",
        )
    except Exception as exc:
        logger.error("policies.reload.error", error=str(exc))
        raise HTTPException(status_code=500, detail=f"Policy reload failed: {exc}")


@router.post("/policies/validate", response_model=PolicyValidateResponse)
async def validate_policies(
    _admin: None = Depends(_require_admin),
) -> PolicyValidateResponse:
    """Validate current Cedar policies and return any errors."""
    cedar_engine = get_cedar_engine()
    settings = get_settings()

    if isinstance(cedar_engine, dict):
        # Stub — basic file presence check
        policies_dir = settings.policies_dir
        errors: list[PolicyValidationError] = []
        if not policies_dir.is_dir():
            errors.append(
                PolicyValidationError(
                    file=str(policies_dir),
                    message="Policies directory does not exist",
                )
            )
        else:
            cedar_files = list(policies_dir.rglob("*.cedar"))
            if not cedar_files:
                errors.append(
                    PolicyValidationError(
                        file=str(policies_dir),
                        message="No .cedar files found in policies directory",
                    )
                )

        return PolicyValidateResponse(valid=len(errors) == 0, errors=errors)

    try:
        error_strs = cedar_engine.validate()
        validation_errors = [
            PolicyValidationError(message=e) for e in error_strs
        ]
        return PolicyValidateResponse(
            valid=len(validation_errors) == 0,
            errors=validation_errors,
        )
    except Exception as exc:
        logger.error("policies.validate.error", error=str(exc))
        raise HTTPException(status_code=500, detail=f"Policy validation failed: {exc}")


@router.post("/plugins/health", response_model=PluginHealthResponse)
async def trigger_health_check(
    _admin: None = Depends(_require_admin),
) -> PluginHealthResponse:
    """Force an immediate health check across all plugins."""
    registry = get_plugin_registry()
    if not isinstance(registry, PluginRegistry):
        return PluginHealthResponse(results=[], healthy_count=0, total_count=0)

    results = await registry.health_check()
    items = [
        PluginHealthResult(plugin=name, healthy=healthy)
        for name, healthy in results.items()
    ]
    return PluginHealthResponse(
        results=items,
        healthy_count=sum(1 for v in results.values() if v),
        total_count=len(results),
    )
