"""Approval queue endpoints — check, approve, or deny queued tool calls."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app_proxy.auth.middleware import verify_admin_key
from app_proxy.main import get_plugin_registry, get_settings
from app_proxy.plugins.registry import PluginRegistry
from app_proxy.routers._approval_store import approval_store

logger = structlog.stdlib.get_logger("app_proxy.routers.approval")

router = APIRouter(prefix="/v1/approval", tags=["approval"])


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------
def _require_admin(request: Request) -> None:
    settings = get_settings()
    verify_admin_key(request, settings)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------
class ApprovalStatus(BaseModel):
    approval_id: str
    status: str  # "pending" | "approved" | "denied" | "executed"
    tool_name: str
    agent_id: str
    tenant_id: str
    created_at: str
    resolved_at: str | None = None
    result: Any = None


class ApprovalActionResponse(BaseModel):
    approval_id: str
    status: str
    result: Any = None


# ---------------------------------------------------------------------------
# MCP dispatch (reused from tools router)
# ---------------------------------------------------------------------------
async def _dispatch_to_plugin(
    plugin_name: str,
    tool_name: str,
    arguments: dict[str, Any],
    timeout: int,
) -> Any:
    """Dispatch a tool call to the MCP plugin — mirrors tools router logic."""
    try:
        from app_proxy.mcp import dispatch_tool_call  # type: ignore[import-untyped]

        return await dispatch_tool_call(plugin_name, tool_name, arguments, timeout)
    except ImportError:
        return {
            "content": [
                {
                    "type": "text",
                    "text": f"[stub] {plugin_name}.{tool_name} called with {arguments}",
                }
            ]
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _get_approval_or_404(approval_id: str) -> dict[str, Any]:
    entry = approval_store.get(approval_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Approval '{approval_id}' not found")
    return entry


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("/{approval_id}", response_model=ApprovalStatus)
async def get_approval_status(approval_id: str) -> ApprovalStatus:
    """Check the current status of an approval request."""
    entry = _get_approval_or_404(approval_id)
    req = entry["request"]
    return ApprovalStatus(
        approval_id=approval_id,
        status=entry["status"],
        tool_name=req["tool_name"],
        agent_id=req["agent_id"],
        tenant_id=req["tenant_id"],
        created_at=entry["created_at"],
        resolved_at=entry.get("resolved_at"),
        result=entry.get("result"),
    )


@router.post("/{approval_id}/approve", response_model=ApprovalActionResponse)
async def approve_call(
    approval_id: str,
    _admin: None = Depends(_require_admin),
) -> ApprovalActionResponse:
    """Approve a pending tool call and dispatch it to the plugin."""
    entry = _get_approval_or_404(approval_id)

    if entry["status"] != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Approval is already '{entry['status']}', cannot approve",
        )

    req = entry["request"]
    plugin_name = entry["plugin_name"]
    timeout = entry["timeout_seconds"]

    # Dispatch to plugin
    try:
        result = await _dispatch_to_plugin(
            plugin_name,
            req["tool_name"],
            req.get("arguments", {}),
            timeout,
        )
    except Exception as exc:
        entry["status"] = "error"
        entry["resolved_at"] = datetime.now(timezone.utc).isoformat()
        entry["result"] = {"error": str(exc)}
        logger.error(
            "approval.dispatch.error",
            approval_id=approval_id,
            error=str(exc),
        )
        raise HTTPException(status_code=502, detail=f"Plugin dispatch failed: {exc}")

    entry["status"] = "executed"
    entry["resolved_at"] = datetime.now(timezone.utc).isoformat()
    entry["result"] = result

    logger.info(
        "approval.approved",
        approval_id=approval_id,
        tool=req["tool_name"],
        plugin=plugin_name,
    )

    return ApprovalActionResponse(
        approval_id=approval_id,
        status="executed",
        result=result,
    )


@router.post("/{approval_id}/deny", response_model=ApprovalActionResponse)
async def deny_call(
    approval_id: str,
    _admin: None = Depends(_require_admin),
) -> ApprovalActionResponse:
    """Deny a pending tool call."""
    entry = _get_approval_or_404(approval_id)

    if entry["status"] != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Approval is already '{entry['status']}', cannot deny",
        )

    entry["status"] = "denied"
    entry["resolved_at"] = datetime.now(timezone.utc).isoformat()

    logger.info(
        "approval.denied",
        approval_id=approval_id,
        tool=entry["request"]["tool_name"],
    )

    return ApprovalActionResponse(
        approval_id=approval_id,
        status="denied",
    )
