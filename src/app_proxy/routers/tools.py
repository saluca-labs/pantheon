"""Tool endpoints — list available tools and dispatch tool calls."""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app_proxy.audit.logger import AuditLogger
from app_proxy.auth.middleware import verify_request
from app_proxy.config import Settings
from app_proxy.main import (
    get_audit_logger,
    get_cedar_engine,
    get_db_engine,
    get_plugin_registry,
    get_settings,
)
from app_proxy.mcp.client import MCPClient, MCPResult
from app_proxy.plugins.registry import PluginRegistry
from app_proxy.policy.engine import CedarDecision as RealCedarDecision

logger = structlog.stdlib.get_logger("app_proxy.routers.tools")

router = APIRouter(prefix="/v1/tools", tags=["tools"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class ToolListRequest(BaseModel):
    agent_id: str | None = None
    tenant_id: str | None = None


class ToolEntry(BaseModel):
    name: str
    plugin: str
    description: str = ""
    inputSchema: dict[str, Any] = Field(default_factory=dict)


class ToolListResponse(BaseModel):
    tools: list[ToolEntry]


class ToolCallRequest(BaseModel):
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    soulkey: str | None = None
    agent_id: str
    tenant_id: str
    reason: str | None = None
    session_id: str | None = None


class ToolCallSuccess(BaseModel):
    status: str = "ok"
    tool_name: str
    result: Any = None
    audit_ref: str


class ToolCallDenied(BaseModel):
    status: str = "denied"
    tool_name: str
    reason: str
    audit_ref: str


class ToolCallPending(BaseModel):
    status: str = "pending_approval"
    tool_name: str
    approval_id: str
    audit_ref: str
    expires_at: str = ""  # ISO datetime when the approval expires
    priority: str = "normal"  # "low" | "normal" | "high" | "critical"


# ---------------------------------------------------------------------------
# Dependency helpers
# ---------------------------------------------------------------------------
def _get_auth_context(request: Request) -> dict[str, Any]:
    settings = get_settings()
    return verify_request(request, settings)


def _get_registry() -> PluginRegistry:
    registry = get_plugin_registry()
    if not isinstance(registry, PluginRegistry):
        raise HTTPException(status_code=503, detail="Plugin registry not available")
    return registry


# ---------------------------------------------------------------------------
# Argument validation
# ---------------------------------------------------------------------------
def _validate_arguments(arguments: dict[str, Any], schema: dict[str, Any]) -> list[str]:
    """Basic type-checking of arguments against an inputSchema.

    Returns a list of error strings (empty if valid).  This is intentionally
    lightweight; full JSON Schema validation can be layered on later.
    """
    errors: list[str] = []
    required = schema.get("required", [])
    properties = schema.get("properties", {})

    for key in required:
        if key not in arguments:
            errors.append(f"Missing required argument: {key}")

    type_map = {
        "string": str,
        "integer": int,
        "number": (int, float),
        "boolean": bool,
        "object": dict,
        "array": list,
    }

    for key, value in arguments.items():
        if key in properties:
            expected_type_str = properties[key].get("type")
            expected_type = type_map.get(expected_type_str)  # type: ignore[arg-type]
            if expected_type and not isinstance(value, expected_type):
                errors.append(
                    f"Argument '{key}' expected type '{expected_type_str}', "
                    f"got '{type(value).__name__}'"
                )

    return errors


# ---------------------------------------------------------------------------
# Cedar authorization
# ---------------------------------------------------------------------------
def _authorize(
    cedar_engine: Any,
    plugin_name: str,
    tool_name: str,
    request: ToolCallRequest,
    tool_def: Any = None,
) -> RealCedarDecision:
    """Evaluate Cedar policies for the tool call via the real CedarPolicyEngine.

    The engine's :meth:`authorize` is synchronous (thread-safe, lock-guarded)
    so this helper is also synchronous.
    """
    try:
        decision = cedar_engine.authorize(
            agent_id=request.agent_id,
            agent_attrs={"soulkey": request.soulkey or "", "roles": []},
            tenant_id=request.tenant_id,
            tenant_attrs={"tier": "enterprise", "max_agents": 50},
            plugin_id=plugin_name,
            plugin_attrs={
                "classification": "destructive" if (
                    tool_def and getattr(tool_def, 'annotations', None)
                    and (tool_def.annotations.get('destructiveHint') or tool_def.annotations.get('tiresias:approvalRequired'))
                ) else "safe",
                "owner_tenant": request.tenant_id,
            },
            action="tool_call",
            context={
                "tool_name": tool_name,
                "rate_count": 0,
                "rate_window_seconds": 3600,
                "hour_of_day": datetime.now(timezone.utc).hour,
                "has_approval": False,
                "estimated_cost_usd": 0,
                "input_keys": list(request.arguments.keys()),
            },
        )
        return decision
    except Exception as exc:
        logger.error("cedar.authorize.error", error=str(exc))
        return RealCedarDecision(
            allowed=False,
            decision="deny",
            reasons=[],
            errors=[f"Policy engine error: {exc}"],
        )


# ---------------------------------------------------------------------------
# MCP dispatch (real)
# ---------------------------------------------------------------------------
_mcp_client = MCPClient()


async def _dispatch_to_plugin(
    registry: PluginRegistry,
    plugin_name: str,
    tool_name: str,
    arguments: dict[str, Any],
) -> MCPResult:
    """Dispatch a tool call to the MCP plugin via the real MCPClient.

    Retrieves the plugin's transport config from the registry and hands it
    to the shared :class:`MCPClient` instance.
    """
    plugin_config = registry.get_plugin_config(plugin_name)
    if plugin_config is None:
        return MCPResult(success=False, error=f"No config for plugin '{plugin_name}'")

    return await _mcp_client.dispatch_tool_call(plugin_config, tool_name, arguments)


# ---------------------------------------------------------------------------
# Audit helpers (DB-backed via AuditLogger)
# ---------------------------------------------------------------------------
def _get_audit_logger() -> AuditLogger:
    """Resolve the AuditLogger from app state."""
    audit = get_audit_logger()
    if not isinstance(audit, AuditLogger):
        raise HTTPException(status_code=503, detail="Audit logger not available")
    return audit


# ---------------------------------------------------------------------------
# Approval service (DB-backed, replaces in-memory dict)
# ---------------------------------------------------------------------------
def _get_approval_service() -> Any:
    """Resolve the DB-backed ApprovalService from app state."""
    try:
        from app_proxy.main import get_approval_service  # type: ignore[attr-defined]
        return get_approval_service()
    except (ImportError, AttributeError, AssertionError):
        raise HTTPException(status_code=503, detail="ApprovalService not available")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post("/list", response_model=ToolListResponse)
async def list_tools(
    body: ToolListRequest,
    _auth: dict[str, Any] = Depends(_get_auth_context),
    registry: PluginRegistry = Depends(_get_registry),
) -> ToolListResponse:
    """List all available tools across all healthy plugins."""
    all_tools = registry.list_tools()
    return ToolListResponse(
        tools=[ToolEntry(**t) for t in all_tools]
    )


@router.post("/call")
async def call_tool(
    body: ToolCallRequest,
    request: Request,
    _auth: dict[str, Any] = Depends(_get_auth_context),
    registry: PluginRegistry = Depends(_get_registry),
) -> ToolCallSuccess | ToolCallDenied | ToolCallPending:
    """Dispatch a tool call through Cedar policy evaluation, MCP plugin dispatch, and DB audit."""
    call_id = str(uuid.uuid4())
    audit = _get_audit_logger()
    t_start = time.perf_counter()

    # 1. Resolve plugin
    resolved = registry.resolve_tool(body.tool_name)
    if resolved is None:
        audit_ref = await audit.record_call(
            tenant_id=body.tenant_id, agent_id=body.agent_id,
            plugin_name="unknown", tool_name=body.tool_name, call_id=call_id,
            arguments=body.arguments, policy_decision="error", policy_reason="Tool not found",
            session_id=body.session_id,
        )
        raise HTTPException(status_code=404, detail=f"Tool '{body.tool_name}' not found")

    plugin, tool_def = resolved

    # 2. Validate arguments
    if tool_def.input_schema:
        errors = _validate_arguments(body.arguments, tool_def.input_schema)
        if errors:
            reason = "; ".join(errors)
            audit_ref = await audit.record_call(
                tenant_id=body.tenant_id, agent_id=body.agent_id,
                plugin_name=plugin.name, tool_name=body.tool_name, call_id=call_id,
                arguments=body.arguments, policy_decision="validation_error",
                policy_reason=reason, session_id=body.session_id,
            )
            raise HTTPException(status_code=422, detail={"validation_errors": errors})

    # 3. Cedar policy authorization (synchronous — engine is thread-safe)
    cedar_engine = get_cedar_engine()
    decision = _authorize(cedar_engine, plugin.name, body.tool_name, body, tool_def=tool_def)

    # Map CedarDecision to policy_decision string
    if decision.allowed:
        policy_decision = "allow"
    elif decision.needs_approval:
        policy_decision = "queue_for_approval"
    else:
        policy_decision = "deny"

    policy_reason = "; ".join(decision.reasons) if decision.reasons else ""

    # Record the call (audit row created before dispatch)
    audit_ref = await audit.record_call(
        tenant_id=body.tenant_id, agent_id=body.agent_id,
        plugin_name=plugin.name, tool_name=body.tool_name, call_id=call_id,
        arguments=body.arguments, policy_decision=policy_decision,
        policy_reason=policy_reason, session_id=body.session_id,
    )

    # 4. Handle deny
    if not decision.allowed and not decision.needs_approval:
        await audit.record_result(audit_ref, status="denied", error_message=policy_reason)
        return ToolCallDenied(
            tool_name=body.tool_name,
            reason=policy_reason or "Denied by policy",
            audit_ref=audit_ref,
        )

    # 5. Handle needs_approval
    if decision.needs_approval:
        settings = get_settings()
        if not settings.enable_approval_queue:
            await audit.record_result(
                audit_ref, status="denied",
                error_message="Approval required but queue disabled",
            )
            return ToolCallDenied(
                tool_name=body.tool_name,
                reason="Action requires approval but approval queue is disabled",
                audit_ref=audit_ref,
            )

        approval_service = _get_approval_service()
        approval_record = await approval_service.enqueue(
            tenant_id=body.tenant_id,
            agent_id=body.agent_id,
            plugin_name=plugin.name,
            tool_name=body.tool_name,
            arguments=body.arguments,
            reason="Cedar policy requires approval for destructive action",
            call_id=call_id,
            audit_ref=audit_ref,
            priority="normal",
        )
        approval_id = str(approval_record.id)
        expires_at = ""
        if hasattr(approval_record, "expires_at") and approval_record.expires_at:
            expires_at = (
                approval_record.expires_at.isoformat()
                if not isinstance(approval_record.expires_at, str)
                else approval_record.expires_at
            )
        priority = getattr(approval_record, "priority", "normal") or "normal"

        await audit.record_result(audit_ref, status="pending_approval")
        await audit.record_approval(
            audit_ref, approval_id=approval_id, approval_status="pending",
        )
        return ToolCallPending(
            tool_name=body.tool_name,
            approval_id=approval_id,
            audit_ref=audit_ref,
            expires_at=expires_at,
            priority=priority,
        )

    # 6. Dispatch to plugin via real MCP client
    try:
        mcp_result: MCPResult = await _dispatch_to_plugin(
            registry, plugin.name, body.tool_name, body.arguments,
        )
    except Exception as exc:
        total_ms = (time.perf_counter() - t_start) * 1000
        await audit.record_result(
            audit_ref, status="error", error_message=str(exc), total_latency_ms=total_ms,
        )
        raise HTTPException(status_code=502, detail=f"Plugin dispatch failed: {exc}")

    total_ms = (time.perf_counter() - t_start) * 1000

    # 7. Record result and return
    if mcp_result.success:
        await audit.record_result(
            audit_ref, status="success", result=mcp_result.result,
            plugin_latency_ms=mcp_result.latency_ms, total_latency_ms=total_ms,
        )
        return ToolCallSuccess(
            tool_name=body.tool_name,
            result=mcp_result.result,
            audit_ref=audit_ref,
        )
    else:
        await audit.record_result(
            audit_ref, status="error", error_message=mcp_result.error,
            plugin_latency_ms=mcp_result.latency_ms, total_latency_ms=total_ms,
        )
        raise HTTPException(
            status_code=502,
            detail=f"Plugin returned error: {mcp_result.error}",
        )
