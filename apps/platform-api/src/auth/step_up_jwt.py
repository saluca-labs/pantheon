"""
Step-up JWT module (Tier 4 Piece A, chunk A2).

Issues and validates short-lived step-up assertion JWTs used to gate
sensitive operations such as encrypted-audit decrypt-scope reveals,
soulkey rotation, and policy promotion. Replay is prevented via the
`_mfa_stepup_nonces` table (one-time jti).

Expected env vars:
    STEPUP_JWT_SIGNING_KEY    required when endpoint using step-up is enabled.
                              HS256 shared secret. Empty is acceptable only
                              when DECRYPT_ENDPOINT_ENABLED=false.
    STEPUP_JWT_ALGORITHM      optional; defaults to 'HS256'. RS256 allowed
                              when STEPUP_JWT_SIGNING_KEY contains a PEM
                              private key and STEPUP_JWT_VERIFY_KEY holds
                              the matching public key.
    STEPUP_JWT_VERIFY_KEY     optional; asymmetric verify key (RS256).
    STEPUP_JWT_TTL_SECONDS    optional; defaults to 60.
    DECRYPT_ENFORCE_MFA       default 'true'; step-up required when set.

Design:
    - Claims: sub, subject_type, scope, jti, iat, exp.
    - On issue: INSERT row into `_mfa_stepup_nonces` with issued_at/expires_at.
    - On validate: verify sig + exp, look up jti, reject if used_at IS NOT NULL,
      else UPDATE used_at=now() (atomic mark-as-used inside same session).
    - All DB work uses the tenant-scoped RLS GUC pattern established by
      prior Tier 5 work — caller must bind `app.current_tenant_id` on
      the session before calling `issue_stepup_jwt` / `validate_stepup_jwt`.
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Optional

import jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


DEFAULT_TTL_SECONDS = 60
_ALLOWED_SUBJECT_TYPES = {"soulkey", "soul_user"}


class StepUpJWTError(Exception):
    """Base class for step-up JWT errors."""


class StepUpJWTConfigError(StepUpJWTError):
    """Signing key missing / misconfigured."""


class StepUpJWTInvalid(StepUpJWTError):
    """Signature / exp / claim validation failed."""


class StepUpJWTReplay(StepUpJWTError):
    """jti has already been consumed."""


class StepUpJWTScopeMismatch(StepUpJWTError):
    """Token scope does not match required scope."""


@dataclass
class StepUpClaims:
    subject_type: str
    subject_id: str
    scope: str
    jti: str
    iat: int
    exp: int


def _get_signing_key() -> str:
    key = os.environ.get("STEPUP_JWT_SIGNING_KEY", "")
    if not key:
        raise StepUpJWTConfigError(
            "STEPUP_JWT_SIGNING_KEY is not set; step-up JWT issuance/validation disabled."
        )
    return key


def _get_verify_key() -> str:
    alg = os.environ.get("STEPUP_JWT_ALGORITHM", "HS256").upper()
    if alg.startswith("RS") or alg.startswith("ES"):
        verify_key = os.environ.get("STEPUP_JWT_VERIFY_KEY", "")
        if not verify_key:
            raise StepUpJWTConfigError(
                "STEPUP_JWT_VERIFY_KEY is required for asymmetric STEPUP_JWT_ALGORITHM."
            )
        return verify_key
    return _get_signing_key()


def _get_algorithm() -> str:
    return os.environ.get("STEPUP_JWT_ALGORITHM", "HS256").upper()


def _get_ttl_seconds() -> int:
    try:
        return int(os.environ.get("STEPUP_JWT_TTL_SECONDS", DEFAULT_TTL_SECONDS))
    except ValueError:
        return DEFAULT_TTL_SECONDS


async def issue_stepup_jwt(
    session: AsyncSession,
    subject_type: str,
    subject_id: str,
    scope: str = "decrypt",
    ttl_seconds: Optional[int] = None,
) -> str:
    """
    Issue a short-lived step-up assertion JWT.

    Side-effect: INSERTs a row in `_mfa_stepup_nonces` under the caller's
    active RLS tenant context. Caller is responsible for `set_tenant_context`
    on the provided session before invoking.

    Raises StepUpJWTConfigError if signing key is not configured.
    """
    if subject_type not in _ALLOWED_SUBJECT_TYPES:
        raise StepUpJWTInvalid(
            f"subject_type must be one of {_ALLOWED_SUBJECT_TYPES}, got {subject_type!r}"
        )

    key = _get_signing_key()
    alg = _get_algorithm()
    ttl = ttl_seconds if ttl_seconds is not None else _get_ttl_seconds()
    now = int(time.time())
    jti = str(uuid.uuid4())

    claims: dict[str, Any] = {
        "sub": str(subject_id),
        "subject_type": subject_type,
        "scope": scope,
        "jti": jti,
        "iat": now,
        "exp": now + ttl,
    }

    token = jwt.encode(claims, key, algorithm=alg)
    if isinstance(token, bytes):
        token = token.decode("utf-8")

    await session.execute(
        text(
            """
            INSERT INTO _mfa_stepup_nonces (
                jti, subject_type, subject_id, scope, issued_at, expires_at
            ) VALUES (
                :jti, :subject_type, :subject_id::uuid, :scope,
                to_timestamp(:iat), to_timestamp(:exp)
            )
            """
        ),
        {
            "jti": jti,
            "subject_type": subject_type,
            "subject_id": str(subject_id),
            "scope": scope,
            "iat": now,
            "exp": now + ttl,
        },
    )
    await session.commit()

    logger.info(
        "stepup_jwt.issued",
        extra={
            "event_type": "auth.stepup.issued",
            "actor_id": str(subject_id),
            "actor_type": subject_type,
            "resource_type": "stepup_jwt",
            "resource_id": jti,
            "scope": scope,
            "ttl_seconds": ttl,
        },
    )
    return token


async def validate_stepup_jwt(
    session: AsyncSession,
    token: str,
    required_scope: str = "decrypt",
) -> StepUpClaims:
    """
    Validate a step-up JWT.

    Verifies:
        - signature + registered algorithm
        - exp not passed
        - scope == required_scope
        - jti exists in `_mfa_stepup_nonces` (not yet used)

    Atomically marks the nonce used (UPDATE ... WHERE used_at IS NULL);
    if zero rows affected, the token was already consumed and
    StepUpJWTReplay is raised.

    Raises:
        StepUpJWTInvalid        - bad signature / expired / malformed
        StepUpJWTScopeMismatch  - scope mismatch
        StepUpJWTReplay         - jti already consumed or not present
    """
    if not token:
        raise StepUpJWTInvalid("empty token")

    verify_key = _get_verify_key()
    alg = _get_algorithm()

    try:
        decoded = jwt.decode(token, verify_key, algorithms=[alg])
    except jwt.ExpiredSignatureError as e:
        raise StepUpJWTInvalid(f"expired: {e}") from e
    except jwt.InvalidTokenError as e:
        raise StepUpJWTInvalid(f"invalid token: {e}") from e

    for required_claim in ("sub", "subject_type", "scope", "jti", "iat", "exp"):
        if required_claim not in decoded:
            raise StepUpJWTInvalid(f"missing claim: {required_claim}")

    if decoded["scope"] != required_scope:
        raise StepUpJWTScopeMismatch(
            f"token scope {decoded['scope']!r} != required {required_scope!r}"
        )

    jti = decoded["jti"]

    # Atomic mark-as-used. Only succeeds if the nonce exists in the caller's
    # RLS-scoped view AND has not already been consumed.
    result = await session.execute(
        text(
            """
            UPDATE _mfa_stepup_nonces
            SET used_at = now()
            WHERE jti = :jti
              AND used_at IS NULL
              AND expires_at > now()
              AND scope = :scope
            RETURNING jti
            """
        ),
        {"jti": jti, "scope": required_scope},
    )
    updated = result.first()
    await session.commit()

    if updated is None:
        raise StepUpJWTReplay(
            f"jti {jti} not found, expired, or already consumed"
        )

    logger.info(
        "stepup_jwt.validated",
        extra={
            "event_type": "auth.stepup.validated",
            "actor_id": str(decoded["sub"]),
            "actor_type": decoded["subject_type"],
            "resource_type": "stepup_jwt",
            "resource_id": jti,
            "scope": decoded["scope"],
        },
    )

    return StepUpClaims(
        subject_type=decoded["subject_type"],
        subject_id=str(decoded["sub"]),
        scope=decoded["scope"],
        jti=jti,
        iat=int(decoded["iat"]),
        exp=int(decoded["exp"]),
    )
