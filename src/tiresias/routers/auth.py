"""SOP compliance evaluation endpoint.

Privacy: Identity resolution uses local SoulKey validation.
Compliance: All evaluations audit-logged with hash chain integrity.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import structlog

from tiresias.auth.pdp import PolicyDecisionPoint
from tiresias.audit.logger import AuditLogger
from tiresias.policy.loader import PolicyLoader
from src.auth.soulkey import SoulKeyResolver  # Tiresias core auth

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/auth", tags=["auth"])

# Global resolver for SOP identity lookup
_soulkey_resolver = SoulKeyResolver()


class EvaluateSOPRequest(BaseModel):
    soulkey: str  # Agent identity key
    sop_id: str  # e.g. "SOP-011"
    action: str  # e.g. "generate_report"
    context: dict[str, Any] = {}


class EvaluateSOPResponse(BaseModel):
    decision: str
    sop_id: str
    action: str
    reason: str
    audit_ref: str
    approval_id: str | None = None


@router.post("/evaluate-sop", response_model=EvaluateSOPResponse)
async def evaluate_sop(request: EvaluateSOPRequest) -> EvaluateSOPResponse:
    """Evaluate SOP compliance for an agent action.

    Returns grant/deny/queue_for_approval with audit trail.
    """
    # Resolve identity from soulkey
    identity = _resolve_identity(request.soulkey)
    if not identity:
        raise HTTPException(status_code=401, detail="Invalid soulkey")

    tenant = identity.get("tenant", "saluca")
    agent_name = identity.get("persona", "unknown")

    loader = PolicyLoader()
    audit = AuditLogger()
    pdp = PolicyDecisionPoint(policy_loader=loader, audit_logger=audit)

    result = pdp.evaluate_sop_compliance(
        identity=agent_name,
        tenant=tenant,
        sop_id=request.sop_id,
        action=request.action,
        context=request.context,
    )

    return EvaluateSOPResponse(
        decision=result.decision,
        sop_id=result.sop_id,
        action=result.action,
        reason=result.reason,
        audit_ref=result.audit_ref,
        approval_id=result.approval_id,
    )


def _resolve_identity(soulkey: str) -> dict | None:
    """Resolve soulkey to identity using Tiresias SoulKey system.

    Privacy: Uses local SoulKey validation, no external calls.
    Compliance: Identity resolution logged for audit trail.
    """
    if not soulkey:
        return None

    try:
        # Use existing Tiresias SoulKey resolution
        identity = _soulkey_resolver.resolve_sync(soulkey)
        if identity:
            return {
                "tenant": identity.tenant_id,
                "persona": identity.persona,
                "soulkey_id": identity.id,
                "capabilities": getattr(identity, "capabilities", []),
            }
        logger.warning("SoulKey resolution returned None", soulkey_prefix=soulkey[:8] if soulkey else None)
        return None
    except Exception as e:
        logger.error("SoulKey resolution failed", error=str(e))
        return None
