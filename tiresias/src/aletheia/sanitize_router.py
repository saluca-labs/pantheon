"""
POST /v1/aletheia/sanitize endpoint.
Receives tool stdout from tiresias-exec, runs sanitizer scan, returns verdict.
On block: stores original output encrypted for forensic review.
"""

import hashlib
import os
import uuid
from typing import Dict, List, Optional

import structlog
from fastapi import APIRouter
from pydantic import BaseModel

from src.aletheia.sanitizer_engine import get_active_sanitizer

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/aletheia", tags=["Aletheia Sanitizer"])


class SanitizeRequest(BaseModel):
    tool: str
    command: str
    output: str
    agent_id: str
    tenant_id: str
    mode: str = "warn"  # passthrough | warn | block


class SanitizeResponse(BaseModel):
    verdict: str
    patterns_matched: List[Dict]
    scan_duration_ms: float
    sanitized_output: Optional[str] = None


@router.post("/sanitize", response_model=SanitizeResponse)
async def sanitize_output(request: SanitizeRequest) -> SanitizeResponse:
    """Scan tool output for prompt injection and other threats.

    Modes:
    - passthrough: skip scan, return clean
    - warn: scan + log, but output passes through
    - block: scan, and if threats found replace output with blocked message
    """
    engine = get_active_sanitizer()
    if engine is None:
        return SanitizeResponse(
            verdict="clean",
            patterns_matched=[],
            scan_duration_ms=0.0,
        )

    # Convert string output to bytes for the engine
    output_bytes = request.output.encode("utf-8", errors="replace")
    result = engine.scan(output_bytes, mode=request.mode)

    response = SanitizeResponse(
        verdict=result.verdict,
        patterns_matched=[
            {
                "pattern_id": m["pattern_id"],
                "category": m["category"],
                "severity": m["severity"],
            }
            for m in result.patterns_matched
        ],
        scan_duration_ms=round(result.scan_duration_ms, 2),
    )

    if result.verdict == "block":
        response.sanitized_output = "[BLOCKED: prompt injection detected in tool response]"

        # Log the blocked event
        pattern_ids = [m["pattern_id"] for m in result.patterns_matched]
        logger.warning(
            "aletheia.sanitizer.blocked",
            agent_id=request.agent_id,
            tenant_id=request.tenant_id,
            command=request.command,
            patterns_matched=pattern_ids,
            scan_duration_ms=result.scan_duration_ms,
        )

        # Store original output encrypted for forensic review
        try:
            _store_blocked_output(
                tenant_id=request.tenant_id,
                agent_id=request.agent_id,
                command=request.command,
                raw_output=output_bytes,
                patterns_matched=result.patterns_matched,
            )
        except Exception as e:
            logger.error(
                "aletheia.sanitizer.forensic_store_failed",
                error=str(e),
                agent_id=request.agent_id,
            )

    elif result.verdict == "warn" and result.patterns_matched:
        pattern_ids = [m["pattern_id"] for m in result.patterns_matched]
        logger.info(
            "aletheia.sanitizer.warn",
            agent_id=request.agent_id,
            tenant_id=request.tenant_id,
            command=request.command,
            patterns_matched=pattern_ids,
            scan_duration_ms=result.scan_duration_ms,
        )

    return response


def _store_blocked_output(
    tenant_id: str,
    agent_id: str,
    command: str,
    raw_output: bytes,
    patterns_matched: list,
) -> None:
    """Encrypt and store blocked output for forensic review.

    Uses existing AES-256-GCM encryption from src.aletheia.encryption.
    Falls back to logging if master key is not configured (non-fatal).
    """
    try:
        from src.aletheia.encryption import get_master_key, derive_tenant_dek, encrypt_content
    except RuntimeError:
        # Master key not configured -- log but don't fail
        logger.warning(
            "aletheia.sanitizer.forensic_store_skipped",
            reason="ALETHEIA_MASTER_KEY not set",
        )
        return

    master_key = get_master_key()
    dek = derive_tenant_dek(master_key, tenant_id)
    ciphertext, nonce, tag = encrypt_content(dek, raw_output)

    output_hash = hashlib.sha512(raw_output).hexdigest()

    # Store via database if available, otherwise log the encrypted blob metadata
    try:
        # Cross-service import: sanitize_router (SoulAuth process) reaches into
        # soulWatch's DB layer to persist blocked outputs. This import is expected
        # to fail gracefully when soulWatch is not co-deployed (e.g. standalone
        # SoulAuth); the outer except block catches ImportError and logs metadata
        # for manual recovery instead.
        from soulWatch.src.database.connection import sync_session_factory
        from soulWatch.src.database.models import AletheiaBlockedOutput

        with sync_session_factory() as session:
            record = AletheiaBlockedOutput(
                tenant_id=uuid.UUID(tenant_id),
                invocation_id=str(uuid.uuid4()),
                agent_id=agent_id,
                command=command[:500],
                encrypted_output=ciphertext,
                output_nonce=nonce,
                output_tag=tag,
                output_hash=output_hash,
                patterns_matched=[
                    {"pattern_id": m["pattern_id"], "category": m["category"], "severity": m["severity"]}
                    for m in patterns_matched
                ],
            )
            session.add(record)
            session.commit()
            logger.info(
                "aletheia.sanitizer.forensic_stored",
                record_id=str(record.id),
                output_hash=output_hash[:32],
            )
    except Exception as e:
        # DB not available -- log metadata for manual recovery
        logger.warning(
            "aletheia.sanitizer.forensic_store_db_failed",
            error=str(e),
            output_hash=output_hash[:32],
            output_size=len(raw_output),
        )
