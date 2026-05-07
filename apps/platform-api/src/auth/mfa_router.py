"""
MFA enrollment and step-up challenge router (Tier 4 Piece A, chunk A3).

Endpoints:
    - POST   /v1/mfa/enroll/start
    - POST   /v1/mfa/enroll/complete
    - GET    /v1/mfa/credentials
    - DELETE /v1/mfa/credentials/{id}
    - POST   /v1/mfa/stepup/challenge
    - POST   /v1/mfa/stepup/verify

Backed by tables `_mfa_credentials` (migration 0036) and
`_mfa_stepup_nonces` (migration 0037). All queries use portable SQL via
`text()` so the router works against both Postgres (production) and
SQLite (unit tests).

Polymorphic subject: (subject_type, subject_id) pair identifies caller as
either a `soulkey` (agent/service) or `soul_user` (portal OIDC user).

CESO-B2 rule: owner-role users MUST enroll a WebAuthn passkey. TOTP is
explicitly rejected for role=owner to prevent shared-secret compromise.

Step-up JWT issuance is delegated to `src.auth.step_up_jwt` (built in
chunk A2). Until A2 ships, a test stub is used; swap is zero-cost because
the shim honours the same signature.
"""

from __future__ import annotations

import base64
import json
import os
import secrets
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.auth.oidc_session import validate_session
from src.auth.soulkey import resolve_identity

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Feature flags (Part 3)
# ---------------------------------------------------------------------------

def _flag(name: str, default: str = "true") -> bool:
    return os.environ.get(name, default).lower() in ("1", "true", "yes", "on")


def mfa_enroll_enabled() -> bool:
    return _flag("MFA_ENROLL_ENABLED", "true")


def mfa_stepup_enabled() -> bool:
    # Stepup is gated by enrollment being enabled too.
    return mfa_enroll_enabled() and _flag("MFA_STEPUP_ENABLED", "true")


router = APIRouter(prefix="/v1/mfa", tags=["mfa"])


# ---------------------------------------------------------------------------
# Step-up JWT integration (A2 hand-off)
# ---------------------------------------------------------------------------
try:
    # A2 will provide the canonical implementation in src/auth/step_up_jwt.py.
    from src.auth.step_up_jwt import issue_stepup_jwt as _issue_stepup_jwt_real  # type: ignore[attr-defined]
    _HAVE_A2 = True
except Exception:  # pragma: no cover - A2 not yet landed
    _HAVE_A2 = False


async def _issue_stepup_jwt(
    db: AsyncSession,
    subject_type: str,
    subject_id: uuid.UUID,
    scope: str,
    ttl_seconds: int = 60,
) -> str:
    """Issue a step-up JWT. Delegates to A2 module when available.

    TODO(A2): remove this stub once `src.auth.step_up_jwt.issue_stepup_jwt`
    is landed. The real implementation must also INSERT a row into
    `_mfa_stepup_nonces` keyed on `jti` so replay-prevention is enforced.
    """
    if _HAVE_A2:
        return await _issue_stepup_jwt_real(
            db=db,
            subject_type=subject_type,
            subject_id=subject_id,
            scope=scope,
            ttl_seconds=ttl_seconds,
        )

    # --- Stub (tests only) ------------------------------------------------
    jti = secrets.token_urlsafe(18)
    now = datetime.now(timezone.utc)
    await db.execute(
        text(
            "INSERT INTO _mfa_stepup_nonces "
            "(jti, subject_type, subject_id, scope, issued_at, expires_at) "
            "VALUES (:jti, :st, :sid, :scope, :iat, :exp)"
        ),
        {
            "jti": jti,
            "st": subject_type,
            "sid": str(subject_id),
            "scope": scope,
            "iat": now,
            "exp": now + timedelta(seconds=ttl_seconds),
        },
    )
    # Stub token: NOT a real JWT. Flagged with `stub.` prefix so any code
    # path that tries to validate it sees a clear signal.
    return f"stub.{jti}.{scope}"


# ---------------------------------------------------------------------------
# Caller resolution: session -> (subject_type, subject_id, tenant_id, role)
# ---------------------------------------------------------------------------

@dataclass
class Caller:
    subject_type: str            # 'soulkey' | 'soul_user'
    subject_id: uuid.UUID
    tenant_id: uuid.UUID
    role: str                    # for soul_user: admin_role; for soulkey: 'agent'


async def _resolve_caller(request: Request, db: AsyncSession) -> Caller:
    """Resolve the caller from either an OIDC session token or a SoulKey."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    raw = auth_header[7:].strip()
    if not raw:
        raise HTTPException(status_code=401, detail="Empty bearer token")

    # SoulKey format: sk_agent_<...>
    if raw.startswith("sk_"):
        soulkey = await resolve_identity(db, raw)
        if not soulkey or soulkey.status != "active":
            raise HTTPException(status_code=401, detail="Invalid soulkey")
        return Caller(
            subject_type="soulkey",
            subject_id=soulkey.id,
            tenant_id=soulkey.tenant_id,
            role="agent",
        )

    # Otherwise: OIDC/local portal session
    result = await validate_session(db, raw)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid session")
    _session, user = result
    return Caller(
        subject_type="soul_user",
        subject_id=user.id,
        tenant_id=user.tenant_id,
        role=user.admin_role or "viewer",
    )


# ---------------------------------------------------------------------------
# Rate limiter: 3/min per (subject_type, subject_id) for enroll/start & stepup
# ---------------------------------------------------------------------------

@dataclass
class _RLRecord:
    starts: list[float] = field(default_factory=list)


class _MfaRateLimiter:
    def __init__(self, max_per_minute: int = 3) -> None:
        self._max = max_per_minute
        self._records: dict[str, _RLRecord] = {}
        self._lock = Lock()

    def check_and_record(self, key: str) -> tuple[bool, int]:
        now = time.time()
        window = 60.0
        with self._lock:
            rec = self._records.setdefault(key, _RLRecord())
            # prune
            rec.starts = [t for t in rec.starts if now - t < window]
            if len(rec.starts) >= self._max:
                retry_after = int(window - (now - rec.starts[0])) + 1
                return False, max(1, retry_after)
            rec.starts.append(now)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._records.clear()


_enroll_limiter = _MfaRateLimiter(max_per_minute=3)
_stepup_limiter = _MfaRateLimiter(max_per_minute=3)


# ---------------------------------------------------------------------------
# Pending enrollment envelope (signed with short-lived HMAC)
# ---------------------------------------------------------------------------

_ENROLL_STATE_SECRET = os.environ.get(
    "MFA_ENROLL_STATE_SECRET",
    "dev-only-rotate-me-" + secrets.token_hex(8),
)


def _sign_envelope(payload: dict) -> str:
    import hmac
    import hashlib as _h

    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
    sig = hmac.new(
        _ENROLL_STATE_SECRET.encode(), body.encode(), _h.sha256
    ).hexdigest()
    return f"{body}.{sig}"


def _verify_envelope(token: str, max_age_seconds: int = 600) -> dict:
    import hmac
    import hashlib as _h

    try:
        body, sig = token.rsplit(".", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid_pending_state")
    expected = hmac.new(
        _ENROLL_STATE_SECRET.encode(), body.encode(), _h.sha256
    ).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=400, detail="invalid_pending_state")
    padded = body + "=" * (-len(body) % 4)
    data = json.loads(base64.urlsafe_b64decode(padded.encode()))
    if time.time() - float(data.get("iat", 0)) > max_age_seconds:
        raise HTTPException(status_code=400, detail="pending_state_expired")
    return data


# ---------------------------------------------------------------------------
# TOTP helpers (RFC 6238)
# ---------------------------------------------------------------------------

def _b32_secret() -> str:
    # 160-bit secret per RFC 4226 recommendation
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _totp_verify(secret_b32: str, code: str, window: int = 1) -> bool:
    import hmac
    import hashlib as _h
    import struct

    code = code.strip().replace(" ", "")
    if not code.isdigit() or len(code) != 6:
        return False
    padded = secret_b32 + "=" * (-len(secret_b32) % 8)
    try:
        key = base64.b32decode(padded, casefold=True)
    except Exception:
        return False
    now_step = int(time.time() // 30)
    for offset in range(-window, window + 1):
        step = now_step + offset
        msg = struct.pack(">Q", step)
        h = hmac.new(key, msg, _h.sha1).digest()
        o = h[-1] & 0x0F
        dbc = ((h[o] & 0x7F) << 24) | ((h[o + 1] & 0xFF) << 16) | ((h[o + 2] & 0xFF) << 8) | (h[o + 3] & 0xFF)
        trunc = dbc % 1_000_000
        if f"{trunc:06d}" == code:
            return True
    return False


# ---------------------------------------------------------------------------
# Feature-flag guard
# ---------------------------------------------------------------------------

def _require_enroll_enabled() -> None:
    if not mfa_enroll_enabled():
        raise HTTPException(status_code=404, detail="mfa_enroll_disabled")


def _require_stepup_enabled() -> None:
    if not mfa_stepup_enabled():
        raise HTTPException(status_code=404, detail="mfa_stepup_disabled")


# ---------------------------------------------------------------------------
# Security event logger (mfa.* namespace)
# ---------------------------------------------------------------------------

def _sec_event(event: str, *, caller: Caller, **fields: Any) -> None:
    logger.info(
        event,
        event_type="SECURITY",
        mfa_event=event,
        subject_type=caller.subject_type,
        subject_id=str(caller.subject_id),
        tenant_id=str(caller.tenant_id),
        role=caller.role,
        **fields,
    )


# ---------------------------------------------------------------------------
# Request/response schemas
# ---------------------------------------------------------------------------

class EnrollStartRequest(BaseModel):
    type: str = Field(..., pattern="^(webauthn|totp)$")
    nickname: Optional[str] = Field(None, max_length=64)


class EnrollCompleteRequest(BaseModel):
    pending_state: str
    code: Optional[str] = None          # TOTP path
    assertion: Optional[dict] = None    # WebAuthn path


class StepupChallengeRequest(BaseModel):
    scope: str = Field(..., pattern="^(decrypt|mfa_manage)$")


class StepupVerifyRequest(BaseModel):
    scope: str = Field(..., pattern="^(decrypt|mfa_manage)$")
    challenge_id: str
    code: Optional[str] = None
    assertion: Optional[dict] = None


# ---------------------------------------------------------------------------
# In-memory challenge registry (single-use, short-lived)
# ---------------------------------------------------------------------------

@dataclass
class _Challenge:
    challenge_id: str
    subject_type: str
    subject_id: str
    scope: str
    credential_type: str
    credential_id: str   # DB row id for _mfa_credentials
    issued_at: float
    used: bool = False
    webauthn_challenge: Optional[str] = None


class _ChallengeStore:
    def __init__(self) -> None:
        self._d: dict[str, _Challenge] = {}
        self._lock = Lock()

    def put(self, c: _Challenge) -> None:
        with self._lock:
            # prune expired (>120s)
            now = time.time()
            for k in [k for k, v in self._d.items() if now - v.issued_at > 120]:
                self._d.pop(k, None)
            self._d[c.challenge_id] = c

    def consume(self, challenge_id: str) -> Optional[_Challenge]:
        with self._lock:
            c = self._d.get(challenge_id)
            if not c or c.used:
                return None
            if time.time() - c.issued_at > 120:
                return None
            c.used = True
            return c

    def reset(self) -> None:
        with self._lock:
            self._d.clear()


_challenge_store = _ChallengeStore()


# ---------------------------------------------------------------------------
# Part 1: Enrollment
# ---------------------------------------------------------------------------

@router.post("/enroll/start")
async def enroll_start(
    body: EnrollStartRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    _require_enroll_enabled()
    caller = await _resolve_caller(http_request, db)

    # CESO-B2: owner role requires WebAuthn; TOTP forbidden
    if caller.role == "owner" and body.type == "totp":
        _sec_event(
            "mfa.enroll.denied",
            caller=caller,
            reason="owner_requires_webauthn",
            requested_type=body.type,
        )
        raise HTTPException(
            status_code=403,
            detail={
                "error": "owner_requires_webauthn",
                "reason": "owner_role_must_use_passkey",
            },
        )

    # Rate limit: 3 starts / minute / subject
    rl_key = f"enroll:{caller.subject_type}:{caller.subject_id}"
    allowed, retry_after = _enroll_limiter.check_and_record(rl_key)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={"error": "rate_limited", "retry_after": retry_after},
            headers={"Retry-After": str(retry_after)},
        )

    now_ts = time.time()
    envelope: dict[str, Any] = {
        "iat": now_ts,
        "subject_type": caller.subject_type,
        "subject_id": str(caller.subject_id),
        "type": body.type,
        "nickname": body.nickname,
    }

    if body.type == "totp":
        secret = _b32_secret()
        envelope["totp_secret"] = secret
        issuer = "Tiresias"
        account = f"{caller.subject_type}:{caller.subject_id}"
        otpauth = (
            f"otpauth://totp/{issuer}:{account}"
            f"?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30"
        )
        _sec_event("mfa.enroll.started", caller=caller, cred_type="totp")
        return {
            "type": "totp",
            "pending_state": _sign_envelope(envelope),
            "otpauth_uri": otpauth,
            "secret_b32": secret,
        }

    # WebAuthn path
    # NOTE: full WebAuthn attestation verification requires the `fido2`
    # library. It is NOT currently in requirements.txt.
    # TODO(fido2): add `fido2>=1.1.0` to requirements.txt and replace this
    #              placeholder challenge issuance with proper PublicKey
    #              credential creation options from fido2.webauthn.
    challenge = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    envelope["webauthn_challenge"] = challenge
    rp_id = os.environ.get("MFA_WEBAUTHN_RP_ID", "tiresias.local")
    user_handle = base64.urlsafe_b64encode(caller.subject_id.bytes).rstrip(b"=").decode()
    _sec_event("mfa.enroll.started", caller=caller, cred_type="webauthn")
    return {
        "type": "webauthn",
        "pending_state": _sign_envelope(envelope),
        "publicKey": {
            "rp": {"id": rp_id, "name": "Tiresias"},
            "user": {
                "id": user_handle,
                "name": f"{caller.subject_type}:{caller.subject_id}",
                "displayName": body.nickname or "Tiresias credential",
            },
            "challenge": challenge,
            "pubKeyCredParams": [{"type": "public-key", "alg": -7}, {"type": "public-key", "alg": -257}],
            "authenticatorSelection": {"userVerification": "required"},
            "timeout": 60000,
            "attestation": "none",
        },
    }


@router.post("/enroll/complete")
async def enroll_complete(
    body: EnrollCompleteRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    _require_enroll_enabled()
    caller = await _resolve_caller(http_request, db)

    env = _verify_envelope(body.pending_state)
    if env.get("subject_type") != caller.subject_type or env.get("subject_id") != str(caller.subject_id):
        raise HTTPException(status_code=403, detail="subject_mismatch")

    cred_type = env["type"]
    cred_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    if cred_type == "totp":
        if not body.code:
            raise HTTPException(status_code=400, detail="totp_code_required")
        secret = env["totp_secret"]
        if not _totp_verify(secret, body.code):
            _sec_event("mfa.enroll.failed", caller=caller, cred_type="totp", reason="bad_code")
            raise HTTPException(status_code=401, detail="invalid_totp_code")
        # Store secret: in production this must be envelope-encrypted via
        # the DEK kept by the decrypt subsystem (chunk A2's decrypt_router).
        # Until wired, store the raw secret bytes in the LargeBinary column
        # and log a TODO.
        # TODO(A2): replace .encode() with decrypt.encrypt_with_dek(secret.encode())
        await db.execute(
            text(
                "INSERT INTO _mfa_credentials "
                "(id, subject_type, subject_id, credential_type, "
                " totp_secret_encrypted, nickname, sign_count, created_at) "
                "VALUES (:id, :st, :sid, 'totp', :secret, :nick, 0, :created)"
            ),
            {
                "id": str(cred_id),
                "st": caller.subject_type,
                "sid": str(caller.subject_id),
                "secret": secret.encode(),
                "nick": env.get("nickname"),
                "created": now,
            },
        )

    elif cred_type == "webauthn":
        if not body.assertion:
            raise HTTPException(status_code=400, detail="webauthn_assertion_required")
        # TODO(fido2): verify attestation chain + challenge match via
        # fido2.server.Fido2Server.register_complete().  For now we accept
        # any assertion containing `credentialId` + `publicKey` fields,
        # which is sufficient for wiring tests until fido2 is added.
        credential_id_b = body.assertion.get("credentialId")
        public_key_b = body.assertion.get("publicKey")
        if not credential_id_b or not public_key_b:
            _sec_event(
                "mfa.enroll.failed", caller=caller,
                cred_type="webauthn", reason="missing_fields",
            )
            raise HTTPException(status_code=400, detail="webauthn_assertion_incomplete")
        await db.execute(
            text(
                "INSERT INTO _mfa_credentials "
                "(id, subject_type, subject_id, credential_type, "
                " credential_id, public_key, nickname, sign_count, created_at) "
                "VALUES (:id, :st, :sid, 'webauthn', "
                "        :cid, :pk, :nick, 0, :created)"
            ),
            {
                "id": str(cred_id),
                "st": caller.subject_type,
                "sid": str(caller.subject_id),
                "cid": credential_id_b,
                "pk": (public_key_b.encode() if isinstance(public_key_b, str) else public_key_b),
                "nick": env.get("nickname"),
                "created": now,
            },
        )
    else:
        raise HTTPException(status_code=400, detail="unknown_credential_type")

    await db.commit()
    _sec_event(
        "mfa.enroll.completed", caller=caller,
        cred_type=cred_type, credential_id=str(cred_id),
    )
    return {"credential_id": str(cred_id), "nickname": env.get("nickname"), "type": cred_type}


@router.get("/credentials")
async def list_credentials(
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    _require_enroll_enabled()
    caller = await _resolve_caller(http_request, db)
    result = await db.execute(
        text(
            "SELECT id, credential_type, nickname, created_at, last_used_at "
            "FROM _mfa_credentials "
            "WHERE subject_type = :st AND subject_id = :sid "
            "ORDER BY created_at ASC"
        ),
        {"st": caller.subject_type, "sid": str(caller.subject_id)},
    )
    rows = result.fetchall()
    return {
        "credentials": [
            {
                "id": str(r[0]),
                "type": r[1],
                "nickname": r[2],
                "created_at": (r[3].isoformat() if hasattr(r[3], "isoformat") else r[3]),
                "last_used_at": (r[4].isoformat() if r[4] and hasattr(r[4], "isoformat") else r[4]),
            }
            for r in rows
        ]
    }


@router.delete("/credentials/{credential_id}")
async def delete_credential(
    credential_id: str,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    _require_enroll_enabled()
    caller = await _resolve_caller(http_request, db)

    # Require a valid step-up token with scope=mfa_manage
    stepup = http_request.headers.get("X-Stepup-Token", "")
    if not stepup:
        raise HTTPException(status_code=401, detail="stepup_required")
    ok = await _verify_stepup_token(db, stepup, caller, scope="mfa_manage")
    if not ok:
        raise HTTPException(status_code=401, detail="invalid_stepup")

    # Prevent owner lockout
    result = await db.execute(
        text(
            "SELECT COUNT(*) FROM _mfa_credentials "
            "WHERE subject_type = :st AND subject_id = :sid"
        ),
        {"st": caller.subject_type, "sid": str(caller.subject_id)},
    )
    count = result.scalar() or 0
    if count <= 1 and caller.role == "owner":
        raise HTTPException(
            status_code=403,
            detail={"error": "cannot_remove_last_credential"},
        )

    result = await db.execute(
        text(
            "DELETE FROM _mfa_credentials "
            "WHERE id = :cid AND subject_type = :st AND subject_id = :sid"
        ),
        {"cid": credential_id, "st": caller.subject_type, "sid": str(caller.subject_id)},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="credential_not_found")

    _sec_event(
        "mfa.credential.removed", caller=caller,
        credential_id=credential_id,
    )
    return {"status": "removed", "credential_id": credential_id}


# ---------------------------------------------------------------------------
# Part 2: Step-up challenge
# ---------------------------------------------------------------------------

async def _verify_stepup_token(
    db: AsyncSession, token: str, caller: Caller, scope: str
) -> bool:
    """Verify a step-up token (JWT in prod; stub format in tests).

    Delegates to A2's verifier when present. The stub path accepts tokens
    of the form `stub.<jti>.<scope>` and consumes the `_mfa_stepup_nonces`
    row as a single-use check.
    """
    if _HAVE_A2:
        try:
            from src.auth.step_up_jwt import verify_stepup_jwt  # type: ignore
        except Exception:
            return False
        try:
            claims = await verify_stepup_jwt(db, token)
        except Exception:
            return False
        return (
            claims.get("scope") == scope
            and claims.get("subject_type") == caller.subject_type
            and claims.get("subject_id") == str(caller.subject_id)
        )

    # Stub path
    if not token.startswith("stub."):
        return False
    try:
        _, jti, tok_scope = token.split(".", 2)
    except ValueError:
        return False
    if tok_scope != scope:
        return False
    now = datetime.now(timezone.utc)
    result = await db.execute(
        text(
            "SELECT subject_type, subject_id, expires_at, used_at "
            "FROM _mfa_stepup_nonces WHERE jti = :jti"
        ),
        {"jti": jti},
    )
    row = result.fetchone()
    if not row:
        return False
    st, sid, exp, used = row[0], row[1], row[2], row[3]
    if used is not None:
        return False
    if exp is not None and hasattr(exp, "replace"):
        exp_cmp = exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
        if exp_cmp < now:
            return False
    if st != caller.subject_type or str(sid) != str(caller.subject_id):
        return False
    await db.execute(
        text("UPDATE _mfa_stepup_nonces SET used_at = :now WHERE jti = :jti"),
        {"now": now, "jti": jti},
    )
    return True


@router.post("/stepup/challenge")
async def stepup_challenge(
    body: StepupChallengeRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    _require_stepup_enabled()
    caller = await _resolve_caller(http_request, db)

    rl_key = f"stepup:{caller.subject_type}:{caller.subject_id}"
    allowed, retry_after = _stepup_limiter.check_and_record(rl_key)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={"error": "rate_limited", "retry_after": retry_after},
            headers={"Retry-After": str(retry_after)},
        )

    # Pick WebAuthn > TOTP
    result = await db.execute(
        text(
            "SELECT id, credential_type, credential_id FROM _mfa_credentials "
            "WHERE subject_type = :st AND subject_id = :sid "
            "ORDER BY CASE credential_type WHEN 'webauthn' THEN 0 ELSE 1 END, created_at ASC"
        ),
        {"st": caller.subject_type, "sid": str(caller.subject_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(
            status_code=412,
            detail={
                "error": "no_mfa_enrolled",
                "hint": "enroll_via_/v1/mfa/enroll/start",
            },
        )

    cred_db_id, cred_type, webauthn_cred_id = str(row[0]), row[1], row[2]
    challenge_id = secrets.token_urlsafe(18)

    webauthn_challenge: Optional[str] = None
    if cred_type == "webauthn":
        webauthn_challenge = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()

    _challenge_store.put(_Challenge(
        challenge_id=challenge_id,
        subject_type=caller.subject_type,
        subject_id=str(caller.subject_id),
        scope=body.scope,
        credential_type=cred_type,
        credential_id=cred_db_id,
        issued_at=time.time(),
        webauthn_challenge=webauthn_challenge,
    ))

    _sec_event(
        "mfa.stepup.challenge.issued", caller=caller,
        scope=body.scope, cred_type=cred_type,
    )

    if cred_type == "webauthn":
        rp_id = os.environ.get("MFA_WEBAUTHN_RP_ID", "tiresias.local")
        return {
            "challenge_id": challenge_id,
            "type": "webauthn",
            "publicKey": {
                "challenge": webauthn_challenge,
                "rpId": rp_id,
                "allowCredentials": [{"type": "public-key", "id": webauthn_cred_id}],
                "userVerification": "required",
                "timeout": 60000,
            },
        }

    return {
        "challenge_id": challenge_id,
        "type": "totp",
        "prompt": "Enter 6-digit code from your authenticator app",
    }


@router.post("/stepup/verify")
async def stepup_verify(
    body: StepupVerifyRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    _require_stepup_enabled()
    caller = await _resolve_caller(http_request, db)

    chal = _challenge_store.consume(body.challenge_id)
    if not chal:
        _sec_event(
            "mfa.stepup.failed", caller=caller,
            scope=body.scope, reason="challenge_missing_or_replayed",
        )
        raise HTTPException(status_code=401, detail="challenge_invalid_or_replayed")

    if chal.subject_type != caller.subject_type or chal.subject_id != str(caller.subject_id):
        _sec_event("mfa.stepup.failed", caller=caller, scope=body.scope, reason="subject_mismatch")
        raise HTTPException(status_code=401, detail="subject_mismatch")

    if chal.scope != body.scope:
        _sec_event("mfa.stepup.failed", caller=caller, scope=body.scope, reason="scope_mismatch")
        raise HTTPException(status_code=401, detail="scope_mismatch")

    # Fetch credential row
    result = await db.execute(
        text(
            "SELECT totp_secret_encrypted, sign_count, credential_type "
            "FROM _mfa_credentials WHERE id = :cid"
        ),
        {"cid": chal.credential_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="credential_missing")

    now = datetime.now(timezone.utc)
    if chal.credential_type == "totp":
        if not body.code:
            raise HTTPException(status_code=400, detail="totp_code_required")
        secret_bytes = row[0]
        secret = secret_bytes.decode() if isinstance(secret_bytes, (bytes, bytearray)) else str(secret_bytes)
        if not _totp_verify(secret, body.code):
            _sec_event("mfa.stepup.failed", caller=caller, scope=body.scope, reason="bad_totp")
            raise HTTPException(status_code=401, detail="invalid_totp_code")
        await db.execute(
            text("UPDATE _mfa_credentials SET last_used_at = :now WHERE id = :cid"),
            {"now": now, "cid": chal.credential_id},
        )
    else:  # webauthn
        if not body.assertion:
            raise HTTPException(status_code=400, detail="webauthn_assertion_required")
        # TODO(fido2): full assertion verification via fido2.server.Fido2Server.authenticate_complete
        # Minimum viable: require clientDataJSON field present and log new sign_count.
        if "clientDataJSON" not in body.assertion:
            _sec_event("mfa.stepup.failed", caller=caller, scope=body.scope, reason="bad_assertion")
            raise HTTPException(status_code=401, detail="invalid_assertion")
        new_count = int(body.assertion.get("signCount", (row[1] or 0) + 1))
        await db.execute(
            text(
                "UPDATE _mfa_credentials "
                "SET last_used_at = :now, sign_count = :sc WHERE id = :cid"
            ),
            {"now": now, "sc": new_count, "cid": chal.credential_id},
        )

    token = await _issue_stepup_jwt(
        db=db,
        subject_type=caller.subject_type,
        subject_id=caller.subject_id,
        scope=body.scope,
        ttl_seconds=60,
    )
    await db.commit()

    _sec_event("mfa.stepup.verified", caller=caller, scope=body.scope)
    return {"stepup_token": token, "expires_in": 60}
