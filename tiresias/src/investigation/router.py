"""
Investigation access router — privilege-tiered evidence retrieval.

Level 0: GET /v1/investigation/evidence/hashes — hash-only (default)
Level 1: GET /v1/investigation/evidence/context — metadata (requires audit:read)
Level 2: POST /v1/investigation/evidence/cleartext — decrypted (requires audit:read + one-time token)
Token:   POST /v1/investigation/tokens — create one-time access token (requires audit:manage)
"""

import hashlib
import uuid
import structlog

from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.auth.rbac import require_permission
from src.investigation.schemas import (
    EvidenceQuery, EvidenceHashResult, EvidenceContextResult,
    EvidenceCleartextResult, CreateAccessTokenRequest, CreateAccessTokenResponse,
)
from src.investigation.tokens import create_access_token, validate_and_consume_token

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/investigation", tags=["Investigation"])


@router.post(
    "/evidence/hashes",
    response_model=list[EvidenceHashResult],
    summary="Level 0: Hash-only evidence (default access)",
    dependencies=[Depends(require_permission("audit:read"))],
)
async def get_evidence_hashes(
    body: EvidenceQuery,
    db: AsyncSession = Depends(get_db),
) -> list[EvidenceHashResult]:
    """Return request/response hashes and metadata — no plaintext."""
    result = await db.execute(text("""
        SELECT id, request_hash, response_hash, model, created_at
        FROM tiresias_audit_log
        WHERE tenant_id = :tid
          AND created_at >= :start AND created_at <= :end
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT :lim
    """), {
        "tid": str(body.tenant_id),
        "start": body.start_time,
        "end": body.end_time,
        "lim": body.limit,
    })
    rows = result.fetchall()
    return [
        EvidenceHashResult(
            record_id=r[0], request_hash=r[1], response_hash=r[2],
            model=r[3], created_at=r[4].isoformat() if r[4] else "",
        )
        for r in rows
    ]


@router.post(
    "/evidence/context",
    response_model=list[EvidenceContextResult],
    summary="Level 1: Context metadata (requires audit role)",
    dependencies=[Depends(require_permission("audit:read"))],
)
async def get_evidence_context(
    body: EvidenceQuery,
    db: AsyncSession = Depends(get_db),
) -> list[EvidenceContextResult]:
    """Return metadata and token counts but no plaintext content."""
    result = await db.execute(text("""
        SELECT id, request_hash, response_hash, model, provider,
               prompt_tokens, completion_tokens, cost_usd, session_id, created_at
        FROM tiresias_audit_log
        WHERE tenant_id = :tid
          AND created_at >= :start AND created_at <= :end
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT :lim
    """), {
        "tid": str(body.tenant_id),
        "start": body.start_time,
        "end": body.end_time,
        "lim": body.limit,
    })
    rows = result.fetchall()
    return [
        EvidenceContextResult(
            record_id=r[0], request_hash=r[1], response_hash=r[2],
            model=r[3], provider=r[4], prompt_tokens=r[5],
            completion_tokens=r[6], cost_usd=r[7], session_id=r[8],
            created_at=r[9].isoformat() if r[9] else "",
        )
        for r in rows
    ]


@router.post(
    "/evidence/cleartext",
    response_model=list[EvidenceCleartextResult],
    summary="Level 2: Decrypted evidence (requires audit role + one-time token)",
    dependencies=[Depends(require_permission("audit:read"))],
)
async def get_evidence_cleartext(
    body: EvidenceQuery,
    request: Request,
    x_investigation_token: str = Header(..., description="One-time investigation access token"),
    db: AsyncSession = Depends(get_db),
) -> list[EvidenceCleartextResult]:
    """
    Decrypt and return prompt/completion cleartext.
    Requires a valid one-time investigation token (consumed on use).
    Download event is audit-logged with SHA-256 integrity hash.
    """
    # Validate and consume token
    token_meta = await validate_and_consume_token(db, x_investigation_token, body.tenant_id)
    if not token_meta:
        raise HTTPException(status_code=403, detail="Invalid, expired, or already-used investigation token")

    # Resolve DEK for decryption
    from src.tiresias.encryption.providers import resolve_kek_provider
    from src.tiresias.encryption.envelope import EnvelopeEncryption
    from src.tiresias.encryption.aead import decrypt_field
    from src.tiresias.config import TiresiasSettings

    t_settings = TiresiasSettings()
    provider = resolve_kek_provider(t_settings)
    envelope = EnvelopeEncryption(provider)

    dek = await envelope.get_or_create_dek(str(body.tenant_id), db)

    # Fetch encrypted records
    result = await db.execute(text("""
        SELECT id, encrypted_prompt, encrypted_completion, model, provider,
               prompt_tokens, completion_tokens, cost_usd, session_id,
               request_hash, response_hash, created_at
        FROM tiresias_audit_log
        WHERE tenant_id = :tid
          AND created_at >= :start AND created_at <= :end
          AND deleted_at IS NULL
          AND encrypted_prompt IS NOT NULL
        ORDER BY created_at DESC
        LIMIT :lim
    """), {
        "tid": str(body.tenant_id),
        "start": body.start_time,
        "end": body.end_time,
        "lim": body.limit,
    })
    rows = result.fetchall()

    results = []
    for r in rows:
        prompt_text = None
        completion_text = None
        try:
            if r[1]:
                prompt_text = decrypt_field(bytes(r[1]), dek)
            if r[2]:
                completion_text = decrypt_field(bytes(r[2]), dek)
        except Exception:
            logger.warning("investigation.decrypt_failed", record_id=r[0])
            continue

        # Integrity hash of decrypted content
        content_for_hash = (prompt_text or "") + (completion_text or "")
        integrity_hash = hashlib.sha256(content_for_hash.encode()).hexdigest()

        results.append(EvidenceCleartextResult(
            record_id=r[0], prompt=prompt_text, completion=completion_text,
            model=r[3], provider=r[4], prompt_tokens=r[5],
            completion_tokens=r[6], cost_usd=r[7], session_id=r[8],
            request_hash=r[9], response_hash=r[10],
            created_at=r[11].isoformat() if r[11] else "",
            integrity_hash=integrity_hash,
        ))

    # Audit log the download event
    try:
        from src.audit.logger import log_auth_event
        soulkey = getattr(request.state, "rbac_soulkey", None)
        await log_auth_event(
            db=db,
            tenant_id=body.tenant_id,
            event_type="evidence_download",
            soulkey_id=str(soulkey.id) if soulkey else None,
            persona_id="auditor",
            resource="investigation",
            action="cleartext_download",
            scope="tenant",
            decision="allow",
            reason=token_meta.get("purpose", "investigation"),
            context={
                "token_id": token_meta["token_id"],
                "records_returned": len(results),
                "time_range": f"{body.start_time.isoformat()} to {body.end_time.isoformat()}",
            },
        )
    except Exception:
        pass

    return results


@router.post(
    "/tokens",
    response_model=CreateAccessTokenResponse,
    summary="Create one-time investigation access token",
    dependencies=[Depends(require_permission("audit:manage"))],
)
async def create_investigation_token(
    body: CreateAccessTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> CreateAccessTokenResponse:
    """
    Create a one-time access token for Level 2 evidence access.
    Token is returned once — store securely. Single use, expires after TTL.
    """
    soulkey = getattr(request.state, "rbac_soulkey", None)
    created_by = f"soulkey:{soulkey.id}" if soulkey else "admin"

    result = await create_access_token(
        db, body.tenant_id, body.purpose, created_by, body.ttl_minutes
    )
    return CreateAccessTokenResponse(**result)
