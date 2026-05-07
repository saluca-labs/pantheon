"""Approval queue endpoints — check, approve, deny, and list queued tool calls.

All state is managed by the DB-backed ApprovalService.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from app_proxy.auth.middleware import verify_admin_key
from app_proxy.main import get_audit_logger, get_plugin_registry, get_settings

# ApprovalService — being built by another agent; guard import.
try:
    from app_proxy.approval.service import ApprovalService, ApprovalRecord
except ImportError:  # pragma: no cover
    ApprovalService = None  # type: ignore[assignment,misc]
    ApprovalRecord = None  # type: ignore[assignment,misc]

from app_proxy.audit.logger import AuditLogger
from app_proxy.mcp.client import MCPClient, MCPResult
from app_proxy.plugins.registry import PluginRegistry

logger = structlog.stdlib.get_logger("app_proxy.routers.approval")

router = APIRouter(prefix="/v1/approval", tags=["approval"])

_mcp_client = MCPClient()


# ---------------------------------------------------------------------------
# Dependency: resolve ApprovalService
# ---------------------------------------------------------------------------
def _get_approval_service() -> Any:
    """Return the ApprovalService singleton from app state.

    The service is registered via ``get_approval_service()`` in main.py by
    another agent.  If that hasn't landed yet, fall back gracefully.
    """
    try:
        from app_proxy.main import get_approval_service  # type: ignore[attr-defined]
        return get_approval_service()
    except (ImportError, AttributeError, AssertionError):
        raise HTTPException(
            status_code=503,
            detail="ApprovalService not available — service not initialised",
        )


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------
def _require_admin(request: Request) -> dict[str, Any]:
    """Verify admin credentials and return auth context."""
    settings = get_settings()
    verify_admin_key(request, settings)
    # Return a minimal context; admin_id extracted from header if present.
    return {"admin_id": request.headers.get("x-admin-id", "admin")}


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------
class ApprovalStatus(BaseModel):
    approval_id: str
    status: str  # "pending" | "approved" | "denied" | "executed" | "expired"
    tool_name: str
    agent_id: str
    tenant_id: str
    created_at: str
    expires_at: str
    resolved_at: Optional[str] = None
    resolved_by: Optional[str] = None
    result: Any = None


class ApprovalActionResponse(BaseModel):
    approval_id: str
    status: str
    resolved_by: Optional[str] = None
    resolved_at: Optional[str] = None
    result: Any = None


class ApprovalListResponse(BaseModel):
    approvals: list[ApprovalStatus]
    count: int


# ---------------------------------------------------------------------------
# MCP dispatch
# ---------------------------------------------------------------------------
async def _dispatch_to_plugin(
    registry: PluginRegistry,
    plugin_name: str,
    tool_name: str,
    arguments: dict[str, Any],
) -> MCPResult:
    """Dispatch a tool call to the MCP plugin via the real MCPClient."""
    plugin_config = registry.get_plugin_config(plugin_name)
    if plugin_config is None:
        return MCPResult(success=False, error=f"No config for plugin '{plugin_name}'")
    return await _mcp_client.dispatch_tool_call(plugin_config, tool_name, arguments)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _record_to_status(record: Any) -> ApprovalStatus:
    """Convert an ApprovalRecord (or duck-typed equivalent) to response model."""
    req = record.request if hasattr(record, "request") else {}
    return ApprovalStatus(
        approval_id=str(record.id),
        status=record.status,
        tool_name=req.get("tool_name", getattr(record, "tool_name", "")),
        agent_id=req.get("agent_id", getattr(record, "agent_id", "")),
        tenant_id=req.get("tenant_id", getattr(record, "tenant_id", "")),
        created_at=_iso(getattr(record, "created_at", None)),
        expires_at=_iso(getattr(record, "expires_at", None)),
        resolved_at=_iso(getattr(record, "resolved_at", None)),
        resolved_by=getattr(record, "resolved_by", None),
        result=getattr(record, "result", None),
    )


def _iso(dt: Any) -> str:
    """Safely convert a datetime-ish value to ISO string."""
    if dt is None:
        return ""
    if isinstance(dt, str):
        return dt
    return dt.isoformat()


def _get_audit() -> AuditLogger:
    audit = get_audit_logger()
    if not isinstance(audit, AuditLogger):
        raise HTTPException(status_code=503, detail="Audit logger not available")
    return audit


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=ApprovalListResponse)
async def list_approvals(
    status: Optional[str] = Query(None, description="Filter by status (pending, approved, denied, expired)"),
    tenant_id: Optional[str] = Query(None, description="Filter by tenant"),
    limit: int = Query(50, ge=1, le=500, description="Max results"),
    _admin: dict[str, Any] = Depends(_require_admin),
) -> ApprovalListResponse:
    """List approval records with optional filters."""
    service = _get_approval_service()
    records = await service.list_pending(tenant_id=tenant_id, limit=limit)
    items = [_record_to_status(r) for r in records]
    return ApprovalListResponse(approvals=items, count=len(items))


@router.get("/{approval_id}", response_model=ApprovalStatus)
async def get_approval_status(approval_id: str) -> ApprovalStatus:
    """Check the current status of an approval request."""
    service = _get_approval_service()
    record = await service.get(approval_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Approval '{approval_id}' not found")
    return _record_to_status(record)


@router.post("/{approval_id}/approve", response_model=ApprovalActionResponse)
async def approve_call(
    approval_id: str,
    admin_ctx: dict[str, Any] = Depends(_require_admin),
) -> ApprovalActionResponse:
    """Approve a pending tool call, dispatch to plugin, and record audit."""
    service = _get_approval_service()
    audit = _get_audit()
    registry = get_plugin_registry()
    if not isinstance(registry, PluginRegistry):
        raise HTTPException(status_code=503, detail="Plugin registry not available")

    admin_id = admin_ctx.get("admin_id", "admin")

    # 1. Mark approved in DB
    record = await service.approve(approval_id, resolved_by=admin_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Approval '{approval_id}' not found")

    if record.status not in ("approved", "executed"):
        raise HTTPException(
            status_code=409,
            detail=f"Approval is '{record.status}', cannot approve",
        )

    # 2. Retrieve original call arguments from the DB record
    req = record.request if hasattr(record, "request") else {}
    plugin_name = getattr(record, "plugin_name", req.get("plugin_name", ""))
    tool_name = req.get("tool_name", "")
    arguments = req.get("arguments", {})
    audit_ref = getattr(record, "audit_ref", "")

    # 3. Dispatch to plugin via MCPClient
    t_start = time.perf_counter()
    try:
        mcp_result: MCPResult = await _dispatch_to_plugin(
            registry, plugin_name, tool_name, arguments,
        )
    except Exception as exc:
        total_ms = (time.perf_counter() - t_start) * 1000
        # Record failure audit
        if audit_ref:
            await audit.record_result(
                audit_ref, status="error", error_message=str(exc), total_latency_ms=total_ms,
            )
            await audit.record_approval(
                audit_ref, approval_id=approval_id, approval_status="error",
                approval_timestamp=datetime.now(timezone.utc),
            )
        logger.error("approval.dispatch.error", approval_id=approval_id, error=str(exc))
        raise HTTPException(status_code=502, detail=f"Plugin dispatch failed: {exc}")

    total_ms = (time.perf_counter() - t_start) * 1000
    resolved_at = datetime.now(timezone.utc)

    # 4. Record audit result
    if audit_ref:
        result_status = "success" if mcp_result.success else "error"
        await audit.record_result(
            audit_ref,
            status=result_status,
            result=mcp_result.result if mcp_result.success else None,
            error_message=mcp_result.error if not mcp_result.success else None,
            plugin_latency_ms=mcp_result.latency_ms,
            total_latency_ms=total_ms,
        )
        await audit.record_approval(
            audit_ref,
            approval_id=approval_id,
            approval_status="executed",
            approval_timestamp=resolved_at,
        )

    logger.info(
        "approval.approved",
        approval_id=approval_id,
        tool=tool_name,
        plugin=plugin_name,
        latency_ms=round(total_ms, 1),
    )

    return ApprovalActionResponse(
        approval_id=approval_id,
        status="executed",
        resolved_by=admin_id,
        resolved_at=resolved_at.isoformat(),
        result=mcp_result.result if mcp_result.success else {"error": mcp_result.error},
    )


@router.post("/{approval_id}/deny", response_model=ApprovalActionResponse)
async def deny_call(
    approval_id: str,
    admin_ctx: dict[str, Any] = Depends(_require_admin),
) -> ApprovalActionResponse:
    """Deny a pending tool call."""
    service = _get_approval_service()
    audit = _get_audit()
    admin_id = admin_ctx.get("admin_id", "admin")

    record = await service.deny(approval_id, resolved_by=admin_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Approval '{approval_id}' not found")

    if record.status not in ("denied",):
        raise HTTPException(
            status_code=409,
            detail=f"Approval is '{record.status}', cannot deny",
        )

    resolved_at = datetime.now(timezone.utc)
    audit_ref = getattr(record, "audit_ref", "")

    # Record audit
    if audit_ref:
        await audit.record_result(audit_ref, status="denied", error_message="Denied by admin")
        await audit.record_approval(
            audit_ref,
            approval_id=approval_id,
            approval_status="denied",
            approval_timestamp=resolved_at,
        )

    logger.info(
        "approval.denied",
        approval_id=approval_id,
        tool=getattr(record, "tool_name", ""),
        resolved_by=admin_id,
    )

    return ApprovalActionResponse(
        approval_id=approval_id,
        status="denied",
        resolved_by=admin_id,
        resolved_at=resolved_at.isoformat(),
    )
