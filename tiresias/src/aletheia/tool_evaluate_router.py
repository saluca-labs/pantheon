"""
Tool Policy Evaluate API router.
POST /v1/aletheia/tool/evaluate — evaluates a tool invocation against loaded policies.
POST /v1/aletheia/tool/reload — hot-reload policies from disk (admin only).

All endpoints gated to enterprise+ tier via feature_gate middleware
(route prefix /v1/aletheia/tool maps to aletheia_tool_policies feature).
"""

from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from src.aletheia.tool_policy_engine import get_active_engine, reload_tool_policies

logger = structlog.get_logger(__name__)

router = APIRouter(
    prefix="/v1/aletheia/tool",
    tags=["Aletheia Tool Policy"],
)


class ToolEvaluateRequest(BaseModel):
    """Request body for tool policy evaluation."""
    agent_id: str = Field(..., description="Agent identity (SoulKey subject)")
    tenant_id: str = Field(..., description="Tenant identity")
    command: str = Field(..., description="Command binary name (e.g., rm, gws)")
    args: list[str] = Field(default_factory=list, description="Command arguments")
    context: Optional[dict] = Field(None, description="Optional context (working_directory, session_id)")


class ToolEvaluateResponse(BaseModel):
    """Response from tool policy evaluation."""
    verdict: str = Field(..., description="Policy verdict: allow, deny, or warn")
    rule_matched: Optional[str] = Field(None, description="Name of the matching rule, if any")
    reason: str = Field(..., description="Human-readable reason for verdict")
    override_applied: bool = Field(False, description="Whether an agent-specific override was applied")
    rate_limited: bool = Field(False, description="Whether this verdict was due to rate limiting")
    logged: bool = Field(True, description="Whether this evaluation was logged")


class ToolReloadResponse(BaseModel):
    """Response from policy reload."""
    reloaded: bool = True
    policy_count: int = 0
    total_rules: int = 0


@router.post(
    "/evaluate",
    response_model=ToolEvaluateResponse,
    summary="Evaluate a tool invocation against loaded policies",
    description=(
        "Called by tiresias-exec before executing a command. Returns allow/deny/warn "
        "verdict based on loaded ToolPolicy YAML rules, agent overrides, and rate limits."
    ),
)
async def evaluate_tool(request: ToolEvaluateRequest) -> ToolEvaluateResponse:
    """Evaluate a tool invocation against the active policy engine."""
    engine = get_active_engine()

    if engine is None:
        logger.debug(
            "tool_evaluate.no_engine",
            agent_id=request.agent_id,
            command=request.command,
        )
        return ToolEvaluateResponse(
            verdict="allow",
            reason="no policy engine active",
            logged=False,
        )

    result = engine.evaluate(
        agent_id=request.agent_id,
        tenant_id=request.tenant_id,
        command=request.command,
        args=request.args,
    )

    logger.info(
        "tool_evaluate.result",
        agent_id=request.agent_id,
        tenant_id=request.tenant_id,
        command=request.command,
        args=request.args,
        verdict=result.verdict,
        rule_matched=result.rule_matched,
        override_applied=result.override_applied,
        rate_limited=result.rate_limited,
    )

    return ToolEvaluateResponse(
        verdict=result.verdict,
        rule_matched=result.rule_matched,
        reason=result.reason,
        override_applied=result.override_applied,
        rate_limited=result.rate_limited,
        logged=True,
    )


@router.post(
    "/reload",
    response_model=ToolReloadResponse,
    summary="Hot-reload tool policies from disk",
    description="Reloads all ToolPolicy YAML files from the policies/tool directory without service restart.",
)
async def reload_policies() -> ToolReloadResponse:
    """Hot-reload tool policies from disk."""
    reload_tool_policies()
    engine = get_active_engine()

    count = engine.policy_count if engine else 0
    rules = engine.total_rules if engine else 0

    logger.info("tool_evaluate.reloaded", policy_count=count, total_rules=rules)

    return ToolReloadResponse(
        reloaded=True,
        policy_count=count,
        total_rules=rules,
    )
