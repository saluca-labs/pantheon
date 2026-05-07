"""
LLM request policy evaluation endpoint.

POST /gate/v1/llm/evaluate — called by the Tiresias proxy before every
LLM API request hits a provider.  Gated endpoints:
  - /v1/chat/completions
  - /v1/completions  (legacy)
  - /v1/embeddings

Returns an allow/deny/modify verdict based on rows in
``_soulgate_llm_policies``.

Authentication: ``X-Internal-Key`` header, validated against
``settings.internal_api_key`` (the same shared secret used by the
metrics and circuit-control endpoints).

Latency target: p99 <30ms inside soulgate so the proxy's <50ms total
budget holds.
"""

from __future__ import annotations

import fnmatch
import time
import uuid
from typing import Optional

import structlog
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from soulGate.config.settings import get_settings
from soulGate.src.database.connection import async_session_factory
from soulGate.src.database.models import SoulGateLLMPolicy

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/gate/v1/llm", tags=["llm-gate"])


class LLMEvaluateRequest(BaseModel):
    """Proxy → soulgate request body."""

    tenant_id: str
    soulkey_id: Optional[str] = None
    persona_id: Optional[str] = None
    model: str
    session_id: Optional[str] = None
    endpoint: str = Field(
        default="/v1/chat/completions",
        description="LLM API endpoint being called. Supported: "
                    "/v1/chat/completions, /v1/completions, /v1/embeddings",
    )
    messages_digest: Optional[str] = None
    message_count: int = 0
    stream: bool = False
    source_ip: Optional[str] = None


class LLMEvaluateResponse(BaseModel):
    """Soulgate → proxy response body."""

    verdict: str = Field(..., description="allow | deny | modify")
    policy_id: Optional[str] = None
    policy_name: Optional[str] = None
    rule_name: Optional[str] = None
    reason_code: Optional[str] = None
    reason: Optional[str] = None
    fail_mode: Optional[str] = Field(
        default=None,
        description="Per-tenant fail-mode override ('open' or 'closed').  Proxy uses "
                    "this when the circuit is open; NULL means use proxy env default.",
    )
    eval_ms: float = 0.0


def _require_internal_key(x_internal_key: Optional[str]) -> None:
    settings = get_settings()
    expected = settings.internal_api_key
    if not expected:
        # If the secret isn't configured on this soulgate pod, deny all
        # evaluate calls (fail-safe on the server side — the proxy will
        # then apply its own fail-open/closed logic).
        raise HTTPException(
            status_code=503,
            detail="soulgate internal auth not configured",
        )
    if x_internal_key != expected:
        raise HTTPException(status_code=401, detail="invalid internal key")


def _match(pattern: str, value: str) -> bool:
    """fnmatch wrapper with tolerant handling of empty/missing values."""
    if not pattern:
        return True
    if pattern == "*":
        return True
    return fnmatch.fnmatchcase(value or "", pattern)


async def _load_tenant_policies(
    db: AsyncSession, tenant_id: uuid.UUID
) -> list[SoulGateLLMPolicy]:
    """Load all enabled policies for a tenant, ordered by priority desc."""
    stmt = (
        select(SoulGateLLMPolicy)
        .where(SoulGateLLMPolicy.tenant_id == tenant_id)
        .where(SoulGateLLMPolicy.enabled.is_(True))
        .order_by(SoulGateLLMPolicy.priority.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


def _evaluate(
    req: LLMEvaluateRequest, policies: list[SoulGateLLMPolicy]
) -> tuple[str, Optional[SoulGateLLMPolicy]]:
    """
    Pure evaluation: first policy matching (soulkey?, persona?, model, endpoint)
    wins.  Returns (verdict, matched_policy_or_none).

    With no policies, default verdict is "allow" (monitor-only posture).
    Per-tenant ``fail_mode`` is pulled from the matched policy if present,
    or — if none matched but any policy for the tenant sets fail_mode —
    the highest-priority such row.  This lets an operator set
    ``fail_mode`` via a blanket allow rule.
    """
    for p in policies:
        if p.soulkey_id is not None:
            if not req.soulkey_id or str(p.soulkey_id) != req.soulkey_id:
                continue
        if p.persona_id is not None:
            if (req.persona_id or "") != p.persona_id:
                continue
        if not _match(p.model_pattern, req.model):
            continue
        if not _match(p.endpoint_pattern, req.endpoint):
            continue
        # Matched.
        action = (p.action or "allow").lower()
        if action not in ("allow", "deny", "modify"):
            action = "allow"
        return action, p
    return "allow", None


def _fail_mode_for_tenant(policies: list[SoulGateLLMPolicy]) -> Optional[str]:
    """Return the highest-priority non-null fail_mode for the tenant, or None."""
    for p in policies:
        if p.fail_mode:
            fm = p.fail_mode.lower()
            if fm in ("open", "closed"):
                return fm
    return None


@router.post("/evaluate", response_model=LLMEvaluateResponse)
async def evaluate_llm(
    body: LLMEvaluateRequest,
    request: Request,
    x_internal_key: Optional[str] = Header(default=None, alias="X-Internal-Key"),
):
    """Evaluate an LLM request against per-tenant policies."""
    _require_internal_key(x_internal_key)

    t0 = time.monotonic()
    try:
        tenant_uuid = uuid.UUID(body.tenant_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="invalid tenant_id")

    async with async_session_factory() as db:
        policies = await _load_tenant_policies(db, tenant_uuid)

    verdict, matched = _evaluate(body, policies)
    fail_mode_override = _fail_mode_for_tenant(policies)
    eval_ms = (time.monotonic() - t0) * 1000.0

    logger.info(
        "llm_evaluate",
        tenant_id=body.tenant_id,
        model=body.model,
        endpoint=body.endpoint,
        verdict=verdict,
        policy_id=str(matched.id) if matched else None,
        eval_ms=round(eval_ms, 2),
        policy_count=len(policies),
    )

    return LLMEvaluateResponse(
        verdict=verdict,
        policy_id=str(matched.id) if matched else None,
        policy_name=None,  # reserved for future named-policy rollouts
        rule_name=matched.reason_code if matched else None,
        reason_code=matched.reason_code if matched else None,
        reason=matched.reason if matched else None,
        fail_mode=fail_mode_override,
        eval_ms=round(eval_ms, 2),
    )
