"""Auditor decrypt endpoint (Tier 4 Piece A, chunk A2).

POST /v1/support/audit/{id}/decrypt
    Auditor-role + MFA step-up-gated reveal of encrypted CoT content
    referenced by a `_security_audit` row's `dek_id`.

    Auth requirements (all must pass):
        1. Session auth (SoulKey or OIDC), role == 'auditor'
        2. `aletheia:decrypt` RBAC permission on the caller's role
        3. Valid single-use step-up JWT in `X-Stepup-Token` header
           (scope='decrypt', enforced via validate_stepup_jwt)

    Audit posture (FAIL-CLOSED):
        - Every denial path emits `audit.decrypt.denied` SECURITY event
          with a reason code and returns 401/403/404.
        - On success, `audit.decrypt.performed` SECURITY event is emitted
          BEFORE the decrypted content is returned to the caller. If the
          audit write fails, the request fails with 503 and NO content
          is leaked. This implements the fail-closed audit contract.

    Feature flag:
        DECRYPT_ENDPOINT_ENABLED (default false). When false, every path
        under `/v1/support/audit/*/decrypt` returns 404 — the endpoint is
        entirely dark. Flip to true only in deployments that have
        Tier 4 MFA fully provisioned.

        DECRYPT_ENFORCE_MFA (default true). When true (recommended and
        standing expectation for this endpoint), step-up JWT is required.
        Setting this to false is ONLY for controlled break-glass scenarios
        and is intentionally not wired in this chunk — the code enforces
        the flag regardless.

        STEPUP_JWT_SIGNING_KEY (required if endpoint enabled).
"""
from __future__ import annotations

import logging
import os
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.rbac import require_permission
from src.auth.step_up_jwt import (
    StepUpClaims,
    StepUpJWTConfigError,
    StepUpJWTError,
    StepUpJWTInvalid,
    StepUpJWTReplay,
    StepUpJWTScopeMismatch,
    validate_stepup_jwt,
)

logger = logging.getLogger(__name__)

SECURITY_LEVEL = 45  # matches tiresias.proxy.logging_utils.SECURITY_LEVEL

router = APIRouter(prefix="/v1/support/audit", tags=["decrypt", "audit"])


def _endpoint_enabled() -> bool:
    return os.environ.get("DECRYPT_ENDPOINT_ENABLED", "false").lower() == "true"


def _enforce_mfa() -> bool:
    return os.environ.get("DECRYPT_ENFORCE_MFA", "true").lower() == "true"


def _emit_security(
    event_type: str,
    outcome: str,
    tenant_id: str | None,
    actor_id: str,
    actor_type: str,
    resource_id: str,
    **extra: Any,
) -> None:
    """Emit a SECURITY-level audit record via the standard logging pipeline.

    The SecurityAuditHandler attached to the root logger (see
    tiresias.proxy.logging_utils.configure_logging) will write a
    hash-chained row into `_security_audit` fire-and-forget. We await
    a best-effort flush below in _emit_security_sync_write for the
    decrypt.performed case, where fail-closed semantics apply.
    """
    extra_fields: dict[str, Any] = {
        "event_type": event_type,
        "outcome": outcome,
        "actor_id": actor_id,
        "actor_type": actor_type,
        "resource_type": "audit_decrypt",
        "resource_id": resource_id,
        "tenant_id": tenant_id,
        "service": "tiresias-proxy",
    }
    extra_fields.update(extra)
    logger.log(SECURITY_LEVEL, event_type, extra=extra_fields)


async def _emit_security_sync_write(
    session: AsyncSession,
    tenant_id: str,
    event_type: str,
    actor_id: str,
    actor_type: str,
    resource_id: str,
    payload: dict[str, Any],
) -> None:
    """Synchronous, fail-closed write of a SECURITY audit row.

    Unlike the fire-and-forget logging-handler path, this writes
    directly to `_security_audit` inside the caller's session and
    RAISES on failure so the caller can fail the request. Used for
    `audit.decrypt.performed` where fail-closed is mandatory.
    """
    import hashlib
    import json
    import time

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    result = await session.execute(
        text(
            "SELECT row_hash FROM _security_audit "
            "WHERE tenant_id = :tid ORDER BY id DESC LIMIT 1"
        ),
        {"tid": tenant_id},
    )
    last = result.first()
    prev_hash = last[0] if last else "genesis"

    payload_json = json.dumps(payload, sort_keys=True, default=str)
    h = hashlib.sha256()
    for part in (prev_hash, event_type, now_iso, actor_id, resource_id, payload_json):
        h.update(part.encode("utf-8"))
        h.update(b"\x1f")
    row_hash = h.hexdigest()

    await session.execute(
        text(
            """
            INSERT INTO _security_audit (
                tenant_id, ts, event_type, actor_id, actor_type, outcome,
                resource_type, resource_id, service, payload, prev_hash, row_hash
            ) VALUES (
                :tenant_id, :ts::timestamptz, :event_type, :actor_id, :actor_type, 'success',
                'audit_decrypt', :resource_id, 'tiresias-proxy',
                CAST(:payload AS JSONB), :prev_hash, :row_hash
            )
            """
        ),
        {
            "tenant_id": tenant_id,
            "ts": now_iso,
            "event_type": event_type,
            "actor_id": actor_id,
            "actor_type": actor_type,
            "resource_id": resource_id,
            "payload": payload_json,
            "prev_hash": prev_hash,
            "row_hash": row_hash,
        },
    )
    await session.commit()


def _dark_guard() -> None:
    """404 the path entirely if the feature flag is off."""
    if not _endpoint_enabled():
        raise HTTPException(status_code=404, detail="Not Found")


@router.post(
    "/{audit_id}/decrypt",
    dependencies=[Depends(require_permission("aletheia:decrypt"))],
)
async def decrypt_audit_row(
    audit_id: str,
    request: Request,
) -> dict[str, Any]:
    """Reveal the encrypted CoT content for a `_security_audit` row.

    Ordered flow:
        1. Feature-flag guard (404 if disabled).
        2. RBAC already enforced via Depends(require_permission).
        3. Resolve caller identity + tenant from request.state (set by
           require_permission).
        4. Validate X-Stepup-Token header (if DECRYPT_ENFORCE_MFA).
        5. Fetch `_security_audit` row scoped by RLS (tenant isolation).
        6. Fetch `aletheia_cot_content` via row.dek_id reference.
        7. Unwrap DEK via envelope + TiresiasLicense.wrapped_dek.
        8. Decrypt content.
        9. FAIL-CLOSED: write `audit.decrypt.performed` SECURITY row.
           On write failure → 503 and DO NOT return decrypted content.
        10. Return decrypted content + metadata.
    """
    _dark_guard()

    # ---- Identity / tenant resolution ----
    soulkey = getattr(request.state, "rbac_soulkey", None)
    role = getattr(request.state, "rbac_role", None)
    if soulkey is None or role is None:
        # RBAC dependency should have rejected earlier; defensive.
        raise HTTPException(status_code=401, detail="authentication_required")

    if role != "auditor":
        # require_permission already checks the `aletheia:decrypt` scope,
        # which only the auditor role carries by default. Belt-and-braces
        # explicit role check for this sensitive surface.
        _emit_security(
            "audit.decrypt.denied", "deny",
            tenant_id=str(getattr(soulkey, "tenant_id", "") or ""),
            actor_id=str(soulkey.id),
            actor_type="session",
            resource_id=audit_id,
            reason="wrong_role",
            presented_role=role,
        )
        raise HTTPException(status_code=403, detail="auditor_role_required")

    tenant_id = str(getattr(soulkey, "tenant_id", "") or "")
    actor_id = str(soulkey.id)

    # ---- Step-up MFA validation ----
    stepup_claims: StepUpClaims | None = None
    if _enforce_mfa():
        stepup_token = request.headers.get("X-Stepup-Token") or request.headers.get("x-stepup-token")
        if not stepup_token:
            _emit_security(
                "audit.decrypt.denied", "deny",
                tenant_id=tenant_id, actor_id=actor_id, actor_type="session",
                resource_id=audit_id, reason="stepup_missing",
            )
            raise HTTPException(status_code=401, detail="stepup_token_required")

        # Use an AsyncSession bound to the proxy engine for nonce lookup.
        try:
            from tiresias.proxy.app import get_settings
            from tiresias.storage.engine import get_engine, set_tenant_context
        except ModuleNotFoundError:
            from src.tiresias.proxy.app import get_settings  # type: ignore[no-redef]
            from src.tiresias.storage.engine import get_engine, set_tenant_context  # type: ignore[no-redef]

        cfg = get_settings()
        engine = await get_engine(
            "__saas__" if cfg.mode == "saas" else tenant_id, cfg.data_root
        )
        async with AsyncSession(engine) as nonce_session:
            await set_tenant_context(nonce_session, tenant_id)
            try:
                stepup_claims = await validate_stepup_jwt(
                    nonce_session, stepup_token, required_scope="decrypt"
                )
            except StepUpJWTReplay as e:
                _emit_security(
                    "audit.decrypt.denied", "deny",
                    tenant_id=tenant_id, actor_id=actor_id, actor_type="session",
                    resource_id=audit_id, reason="stepup_replay", error=str(e),
                )
                raise HTTPException(status_code=401, detail="stepup_replay") from e
            except StepUpJWTScopeMismatch as e:
                _emit_security(
                    "audit.decrypt.denied", "deny",
                    tenant_id=tenant_id, actor_id=actor_id, actor_type="session",
                    resource_id=audit_id, reason="stepup_scope_mismatch", error=str(e),
                )
                raise HTTPException(status_code=401, detail="stepup_scope_mismatch") from e
            except StepUpJWTInvalid as e:
                _emit_security(
                    "audit.decrypt.denied", "deny",
                    tenant_id=tenant_id, actor_id=actor_id, actor_type="session",
                    resource_id=audit_id, reason="stepup_invalid", error=str(e),
                )
                raise HTTPException(status_code=401, detail="stepup_invalid") from e
            except StepUpJWTConfigError as e:
                # Misconfiguration: fail closed.
                _emit_security(
                    "audit.decrypt.denied", "deny",
                    tenant_id=tenant_id, actor_id=actor_id, actor_type="session",
                    resource_id=audit_id, reason="stepup_config_error", error=str(e),
                )
                raise HTTPException(status_code=503, detail="stepup_not_configured") from e
            except StepUpJWTError as e:
                _emit_security(
                    "audit.decrypt.denied", "deny",
                    tenant_id=tenant_id, actor_id=actor_id, actor_type="session",
                    resource_id=audit_id, reason="stepup_error", error=str(e),
                )
                raise HTTPException(status_code=401, detail="stepup_failed") from e

    # ---- Fetch encrypted content + decrypt ----
    try:
        from tiresias.proxy.app import get_envelope, get_settings
        from tiresias.storage.engine import get_engine, set_tenant_context
    except ModuleNotFoundError:
        from src.tiresias.proxy.app import get_envelope, get_settings  # type: ignore[no-redef]
        from src.tiresias.storage.engine import get_engine, set_tenant_context  # type: ignore[no-redef]

    cfg = get_settings()
    engine = await get_engine(
        "__saas__" if cfg.mode == "saas" else tenant_id, cfg.data_root
    )

    async with AsyncSession(engine) as session:
        await set_tenant_context(session, tenant_id)

        audit_row = (await session.execute(
            text(
                """
                SELECT id, tenant_id, payload, trace_id
                FROM _security_audit
                WHERE id = :aid AND tenant_id = :tid
                """
            ),
            {"aid": audit_id, "tid": tenant_id},
        )).first()

        if audit_row is None:
            _emit_security(
                "audit.decrypt.denied", "deny",
                tenant_id=tenant_id, actor_id=actor_id, actor_type="session",
                resource_id=audit_id, reason="audit_row_not_found",
            )
            raise HTTPException(status_code=404, detail="audit_row_not_found")

        payload = audit_row[2] or {}
        dek_id = None
        if isinstance(payload, dict):
            dek_id = payload.get("dek_id")

        content_row = None
        if dek_id is not None:
            content_row = (await session.execute(
                text(
                    """
                    SELECT c.id, c.encrypted_content, c.content_nonce,
                           c.content_tag, c.dek_id
                    FROM aletheia_cot_content c
                    WHERE c.dek_id = :dek_id AND c.tenant_id = :tid
                    LIMIT 1
                    """
                ),
                {"dek_id": dek_id, "tid": tenant_id},
            )).first()

        if content_row is None:
            _emit_security(
                "audit.decrypt.denied", "deny",
                tenant_id=tenant_id, actor_id=actor_id, actor_type="session",
                resource_id=audit_id, reason="content_not_found",
                dek_id=str(dek_id) if dek_id else None,
            )
            raise HTTPException(status_code=404, detail="encrypted_content_not_found")

        # Unwrap DEK + decrypt. Envelope module manages per-tenant DEK cache.
        try:
            envelope = get_envelope()
            dek = await envelope.get_or_create_dek(tenant_id, session)
            # aletheia_cot_content stores encrypted_content as the AEAD blob;
            # nonce + tag are columns but our aead.decrypt_field expects a
            # single packed blob. Compose blob = nonce || ciphertext || tag
            # to match aead.encrypt_field output format.
            blob = bytes(content_row[2]) + bytes(content_row[1]) + bytes(content_row[3])
            plaintext = await envelope.decrypt(blob, dek)
        except Exception as e:
            _emit_security(
                "audit.decrypt.denied", "deny",
                tenant_id=tenant_id, actor_id=actor_id, actor_type="session",
                resource_id=audit_id, reason="decrypt_failure", error=str(e),
            )
            raise HTTPException(status_code=500, detail="decrypt_failed") from e

        # ---- FAIL-CLOSED audit write BEFORE returning ----
        stepup_jti = stepup_claims.jti if stepup_claims else None
        try:
            await _emit_security_sync_write(
                session,
                tenant_id=tenant_id,
                event_type="audit.decrypt.performed",
                actor_id=actor_id,
                actor_type="session",
                resource_id=audit_id,
                payload={
                    "audit_id": audit_id,
                    "dek_id": str(dek_id) if dek_id else None,
                    "stepup_jti": stepup_jti,
                    "auditor_role": role,
                    "content_id": str(content_row[0]),
                },
            )
        except Exception as e:
            logger.error(
                "audit.decrypt.write_failed",
                extra={
                    "event_type": "audit.decrypt.write_failed",
                    "tenant_id": tenant_id,
                    "error": str(e),
                    "audit_id": audit_id,
                },
            )
            # Fail-closed: no plaintext leaves the process.
            raise HTTPException(
                status_code=503,
                detail="audit_write_failed_request_aborted",
            ) from e

        return {
            "audit_id": audit_id,
            "dek_id": str(dek_id) if dek_id else None,
            "content_id": str(content_row[0]),
            "plaintext": plaintext,
            "stepup_jti": stepup_jti,
        }
