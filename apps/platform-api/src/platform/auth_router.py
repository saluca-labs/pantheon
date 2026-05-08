"""
Platform v2 auth follow-up router.

Exposes password-reset, email-verification, and an auth-mode discovery
endpoint. Built on the new `platform_auth.tokens` and `platform_auth.oidc`
helpers so it stays decoupled from the legacy `src.auth.*` modules.

Email delivery is intentionally pluggable: an in-process queue (the
`_platform_jobs` table populated by `src.worker`) is enqueued on every
issue request. The actual SMTP send is handled by a worker handler that
ships separately so this router has no SMTP dependency.

Endpoints:
    GET  /v1/auth/mode
    POST /v1/auth/password/reset/request
    POST /v1/auth/password/reset/confirm
    POST /v1/auth/email/verification/request
    POST /v1/auth/email/verification/confirm
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from platform_auth import (
    auth_mode,
    consume_email_verification_token,
    consume_password_reset_token,
    hash_password,
    is_oidc_enabled,
    issue_email_verification_token,
    issue_password_reset_token,
)

logger = logging.getLogger("platform.auth_router")

router = APIRouter(prefix="/v1/auth", tags=["platform-auth"])


# ── DB dependency (defer import; legacy src.database may not be ready) ─────


async def _get_db() -> AsyncSession:  # type: ignore[return-value]
    """Lazy import the legacy DB dependency to avoid hard coupling at module load."""
    from src.database.connection import get_db  # type: ignore

    async for session in get_db():
        yield session


# ── Schemas ────────────────────────────────────────────────────────────────


class AuthModeResponse(BaseModel):
    mode: str = Field(..., description="Active AUTH_MODE: 'local' or 'oidc'")
    oidc_enabled: bool


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(..., min_length=20)
    new_password: str = Field(..., min_length=12, max_length=256)


class EmailVerificationRequest(BaseModel):
    email: EmailStr


class EmailVerificationConfirm(BaseModel):
    token: str = Field(..., min_length=20)


class GenericAck(BaseModel):
    status: str
    detail: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────


async def _enqueue_job(session: AsyncSession, kind: str, payload: dict) -> None:
    """
    Enqueue a worker job. We write to the same `_platform_jobs` table
    consumed by `src.worker`. The DDL is created lazily by the worker, so
    if the table doesn't exist yet we silently skip — the user-facing
    endpoint still succeeds.
    """
    # Postgres needs a JSONB cast; SQLite (used in tests) does not.
    dialect = session.bind.dialect.name if session.bind is not None else ""
    cast_clause = "CAST(:payload AS JSONB)" if dialect == "postgresql" else ":payload"
    try:
        await session.execute(
            text(
                f"""
                INSERT INTO _platform_jobs (id, kind, payload)
                VALUES (:id, :kind, {cast_clause})
                """
            ),
            {"id": str(uuid.uuid4()), "kind": kind, "payload": json.dumps(payload)},
        )
    except Exception as exc:
        logger.warning("auth_router.enqueue_failed kind=%s error=%s", kind, exc)


async def _find_user_id_by_email(session: AsyncSession, email: str) -> Optional[str]:
    """Look up a user by email. Returns user_id (str) or None."""
    try:
        result = await session.execute(
            text("SELECT id FROM users WHERE LOWER(email) = LOWER(:email) LIMIT 1"),
            {"email": email},
        )
        row = result.first()
        return str(row[0]) if row else None
    except Exception as exc:
        logger.warning("auth_router.lookup_failed email=%s error=%s", email, exc)
        return None


async def _update_password(session: AsyncSession, user_id: str, password_hash: str) -> bool:
    """Update the password_hash column on the users table."""
    try:
        result = await session.execute(
            text(
                """
                UPDATE users
                SET password_hash = :ph
                WHERE id = :id
                """
            ),
            {"id": user_id, "ph": password_hash},
        )
        return (result.rowcount or 0) > 0
    except Exception as exc:
        logger.error("auth_router.update_password_failed id=%s error=%s", user_id, exc)
        return False


async def _mark_email_verified(session: AsyncSession, user_id: str) -> bool:
    try:
        result = await session.execute(
            text("UPDATE users SET email_verified = TRUE WHERE id = :id"),
            {"id": user_id},
        )
        return (result.rowcount or 0) > 0
    except Exception as exc:
        logger.error("auth_router.mark_verified_failed id=%s error=%s", user_id, exc)
        return False


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.get("/mode", response_model=AuthModeResponse)
async def get_auth_mode() -> AuthModeResponse:
    return AuthModeResponse(mode=auth_mode(), oidc_enabled=is_oidc_enabled())


@router.post(
    "/password/reset/request",
    response_model=GenericAck,
    status_code=status.HTTP_202_ACCEPTED,
)
async def request_password_reset(
    body: PasswordResetRequest,
    db: AsyncSession = Depends(_get_db),
) -> GenericAck:
    """
    Issue a password reset token. Always returns 202 to prevent email
    enumeration; only when the user exists do we actually issue a token
    and enqueue a delivery job.
    """
    user_id = await _find_user_id_by_email(db, body.email)
    if user_id is None:
        logger.info("auth_router.reset_request unknown_email=%s", body.email)
        return GenericAck(status="accepted")

    token = await issue_password_reset_token(user_id, db)
    await _enqueue_job(
        db,
        kind="email.password_reset",
        payload={"email": body.email, "user_id": user_id, "token": token},
    )
    await db.commit()
    logger.info("auth_router.reset_request issued user_id=%s", user_id)
    return GenericAck(status="accepted")


@router.post("/password/reset/confirm", response_model=GenericAck)
async def confirm_password_reset(
    body: PasswordResetConfirm,
    db: AsyncSession = Depends(_get_db),
) -> GenericAck:
    user_id = await consume_password_reset_token(body.token, db)
    if user_id is None:
        raise HTTPException(status_code=400, detail="invalid or expired token")
    new_hash = hash_password(body.new_password)
    ok = await _update_password(db, user_id, new_hash)
    if not ok:
        raise HTTPException(status_code=500, detail="failed to update password")
    await db.commit()
    logger.info("auth_router.reset_confirm user_id=%s", user_id)
    return GenericAck(status="ok")


@router.post(
    "/email/verification/request",
    response_model=GenericAck,
    status_code=status.HTTP_202_ACCEPTED,
)
async def request_email_verification(
    body: EmailVerificationRequest,
    db: AsyncSession = Depends(_get_db),
) -> GenericAck:
    user_id = await _find_user_id_by_email(db, body.email)
    if user_id is None:
        logger.info("auth_router.verify_request unknown_email=%s", body.email)
        return GenericAck(status="accepted")

    token = await issue_email_verification_token(user_id, db)
    await _enqueue_job(
        db,
        kind="email.verification",
        payload={"email": body.email, "user_id": user_id, "token": token},
    )
    await db.commit()
    logger.info("auth_router.verify_request issued user_id=%s", user_id)
    return GenericAck(status="accepted")


@router.post("/email/verification/confirm", response_model=GenericAck)
async def confirm_email_verification(
    body: EmailVerificationConfirm,
    db: AsyncSession = Depends(_get_db),
) -> GenericAck:
    user_id = await consume_email_verification_token(body.token, db)
    if user_id is None:
        raise HTTPException(status_code=400, detail="invalid or expired token")
    ok = await _mark_email_verified(db, user_id)
    if not ok:
        raise HTTPException(status_code=500, detail="failed to mark email verified")
    await db.commit()
    logger.info("auth_router.verify_confirm user_id=%s", user_id)
    return GenericAck(status="ok")
