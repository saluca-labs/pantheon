"""
PRH Sigma Bridge — converts PRHResult into Sigma-compatible events
and submits them to the existing SigmaEngine for rule evaluation.

Also provides async helper for writing PRH findings to the audit log.

Usage (from middleware or router):
    from src.prh.sigma_bridge import emit_prh_event, log_prh_to_audit

    matches = emit_prh_event(result, tenant_id="abc", soulkey_id="xyz")
    await log_prh_to_audit(db, result, tenant_id=tenant_uuid, soulkey_id=key_uuid)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog

from src.prh.analyzer import PRHResult

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Event construction
# ---------------------------------------------------------------------------

def build_sigma_event(
    result: PRHResult,
    tenant_id: str,
    soulkey_id: Optional[str] = None,
    persona_id: Optional[str] = None,
    prompt_snippet: Optional[str] = None,
) -> dict:
    """
    Build a Sigma-compatible event dict from a PRHResult.

    The event schema is flat so Sigma field matchers can address top-level keys
    directly, consistent with how SoulAuth audit events are structured.
    """
    return {
        # Sigma logsource discriminator
        "event_type": "prh_finding",
        "product": "tiresias",
        "service": "prh",
        # PRH evidence fields (addressable in Sigma detection rules)
        "prh_score": result.score,
        "prh_category": result.category,
        "prh_patterns": result.patterns,
        "prh_confidence": result.confidence,
        "prh_flagged": result.flagged,
        "prh_prompt_length": result.prompt_length,
        "prh_all_scores": result.all_scores,
        # Identity context
        "tenant_id": tenant_id,
        "soulkey_id": soulkey_id,
        "persona_id": persona_id,
        # Optional prompt snippet for analyst review (first 200 chars)
        "prompt_snippet": (prompt_snippet or "")[:200],
        # Timestamp
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Sigma emission (synchronous — SigmaEngine.evaluate is sync)
# ---------------------------------------------------------------------------

def emit_prh_event(
    result: PRHResult,
    tenant_id: str,
    soulkey_id: Optional[str] = None,
    persona_id: Optional[str] = None,
    prompt_snippet: Optional[str] = None,
) -> list:
    """
    If the PRHResult is flagged, build a Sigma event and run it through
    SigmaEngine.evaluate(). Returns the list of SigmaMatch objects (may be empty).

    If the result is not flagged, returns an empty list without touching Sigma.
    """
    if not result.flagged:
        return []

    try:
        from src.detection._state import get_sigma_engine
        sigma = get_sigma_engine()
    except Exception as exc:
        logger.warning("prh.sigma_unavailable", error=str(exc))
        return []

    event = build_sigma_event(
        result,
        tenant_id=tenant_id,
        soulkey_id=soulkey_id,
        persona_id=persona_id,
        prompt_snippet=prompt_snippet,
    )

    try:
        matches = sigma.evaluate(event)
        if matches:
            logger.info(
                "prh.sigma_matches",
                tenant_id=tenant_id,
                prh_score=result.score,
                prh_category=result.category,
                match_count=len(matches),
                rules=[m.rule.id for m in matches],
            )
        return matches
    except Exception as exc:
        logger.warning("prh.sigma_evaluate_error", error=str(exc))
        return []


# ---------------------------------------------------------------------------
# Audit logging (async — requires DB session)
# ---------------------------------------------------------------------------

async def log_prh_to_audit(
    db,
    result: PRHResult,
    tenant_id: uuid.UUID,
    soulkey_id: Optional[uuid.UUID] = None,
    persona_id: Optional[str] = None,
    prompt_snippet: Optional[str] = None,
) -> Optional[uuid.UUID]:
    """
    Write a PRH finding to the immutable audit log.
    Returns the audit record UUID, or None if logging fails.

    Stores full PRH evidence in the context field for analyst review
    and querying via the existing /v1/audit endpoint.
    """
    try:
        from src.audit.logger import log_auth_event

        audit_context = {
            "prh": {
                "score": round(result.score, 4),
                "category": result.category,
                "patterns": result.patterns,
                "confidence": round(result.confidence, 4),
                "all_scores": {k: round(v, 4) for k, v in result.all_scores.items()},
                "prompt_length": result.prompt_length,
                "flagged": result.flagged,
                "analysis_ms": round(result.analysis_ms, 2),
                "prompt_snippet": (prompt_snippet or "")[:200],
            }
        }

        record_id = await log_auth_event(
            db=db,
            tenant_id=tenant_id,
            event_type="prh_finding",
            soulkey_id=soulkey_id,
            persona_id=persona_id,
            resource="prompt",
            action="analyze",
            reason=f"prh_score={result.score:.3f} category={result.category}",
            context=audit_context,
        )

        logger.info(
            "prh.audit_logged",
            record_id=str(record_id),
            tenant_id=str(tenant_id),
            prh_score=result.score,
            prh_category=result.category,
        )
        return record_id

    except Exception as exc:
        logger.warning("prh.audit_log_error", error=str(exc))
        return None
