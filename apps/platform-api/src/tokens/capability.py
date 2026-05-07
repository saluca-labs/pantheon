"""
Capability token (JWT) issuance and validation.
Implements SPEC.md section 5.3 — ES256 signed, short-lived, session-bound.
"""

import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import get_settings

logger = logging.getLogger(__name__)


class TokenError(Exception):
    """Base error for token operations."""
    pass


class TokenExpiredError(TokenError):
    pass


class TokenInvalidError(TokenError):
    pass


class TokenRevokedError(TokenError):
    pass


# Reserved JWT claim names that extra_claims must not overwrite
_RESERVED_CLAIMS = {"iss", "sub", "tid", "pid", "scp", "sid", "jti", "iat", "exp"}

# In-memory revocation cache (backed by DB via RevokedToken model)
_revoked_tokens: set[str] = set()


def _load_private_key():
    """Load ES256 private key from config. Ephemeral keys only allowed in debug mode."""
    import os
    settings = get_settings()
    if settings.jwt_private_key_path and os.path.exists(settings.jwt_private_key_path):
        with open(settings.jwt_private_key_path, "rb") as f:
            return serialization.load_pem_private_key(f.read(), password=None)
    elif settings.jwt_private_key:
        return serialization.load_pem_private_key(
            settings.jwt_private_key.encode(), password=None
        )
    elif settings.debug:
        # Generate ephemeral key ONLY in debug/development mode
        if settings.jwt_private_key_path:
            logger.warning(
                "Configured key file %s not found, falling back to ephemeral keys (debug mode).",
                settings.jwt_private_key_path,
            )
        logger.warning(
            "SECURITY WARNING: Using ephemeral JWT keys. All tokens will be "
            "invalidated on restart. Set jwt_private_key_path or jwt_private_key "
            "in settings for production use."
        )
        return ec.generate_private_key(ec.SECP256R1(), default_backend())
    else:
        raise RuntimeError(
            "No JWT signing key configured. Set SOULAUTH_JWT_PRIVATE_KEY_PATH "
            "or SOULAUTH_JWT_PRIVATE_KEY environment variable. Ephemeral keys "
            "are only allowed when SOULAUTH_DEBUG=true."
        )


def _load_public_key():
    """Load ES256 public key from config or derive from private key."""
    import os
    settings = get_settings()
    if settings.jwt_public_key_path and os.path.exists(settings.jwt_public_key_path):
        with open(settings.jwt_public_key_path, "rb") as f:
            return serialization.load_pem_public_key(f.read())
    elif settings.jwt_public_key:
        return serialization.load_pem_public_key(settings.jwt_public_key.encode())
    else:
        # Derive from the private key (will fail in non-debug if no key configured)
        private_key = _load_private_key()
        return private_key.public_key()


# Cache keys at module level
_private_key = None
_public_key = None


def get_private_key():
    global _private_key
    if _private_key is None:
        _private_key = _load_private_key()
    return _private_key


def get_public_key():
    import os
    global _public_key
    if _public_key is None:
        settings = get_settings()
        if settings.jwt_public_key_path and os.path.exists(settings.jwt_public_key_path):
            with open(settings.jwt_public_key_path, "rb") as f:
                _public_key = serialization.load_pem_public_key(f.read())
        elif settings.jwt_public_key:
            _public_key = serialization.load_pem_public_key(settings.jwt_public_key.encode())
        else:
            # Derive from the CACHED private key (not a new one)
            _public_key = get_private_key().public_key()
    return _public_key


def issue_capability_token(
    soulkey_id: uuid.UUID,
    tenant_id: uuid.UUID,
    persona_id: str,
    granted_scopes: list[str],
    ttl: int = 300,
    session_binding: Optional[str] = None,
    extra_claims: Optional[dict] = None,
) -> tuple[str, str, datetime]:
    """
    Issue a capability token (JWT).

    Returns (encoded_token, jti, expiry_datetime).
    extra_claims are merged into the payload (e.g. user context: uid, ucl).
    """
    now = datetime.now(timezone.utc)
    exp = now + timedelta(seconds=ttl)
    jti = str(uuid.uuid4())

    payload = {
        "iss": "soulauth",
        "sub": str(soulkey_id),
        "tid": str(tenant_id),
        "pid": persona_id,
        "scp": granted_scopes,
        "sid": session_binding or "",
        "jti": jti,
        "iat": now,
        "exp": exp,
    }

    if extra_claims:
        # Filter out reserved claim names to prevent overwriting core JWT claims
        filtered = {k: v for k, v in extra_claims.items() if k not in _RESERVED_CLAIMS}
        if len(filtered) != len(extra_claims):
            blocked = set(extra_claims.keys()) & _RESERVED_CLAIMS
            logger.warning(
                "Blocked extra_claims attempting to overwrite reserved claims: %s",
                blocked,
            )
        payload.update(filtered)

    private_key = get_private_key()
    token = jwt.encode(payload, private_key, algorithm="ES256")

    return token, jti, exp


def validate_capability_token(token: str) -> dict:
    """
    Validate and decode a capability token.
    Raises TokenExpiredError, TokenInvalidError, or TokenRevokedError.
    """
    public_key = get_public_key()

    try:
        claims = jwt.decode(
            token,
            public_key,
            algorithms=["ES256"],
            options={
                "require": ["exp", "sub", "tid", "scp", "jti", "iss"],
            },
        )
    except jwt.ExpiredSignatureError:
        raise TokenExpiredError("Capability token has expired")
    except jwt.InvalidTokenError as e:
        raise TokenInvalidError(f"Invalid capability token: {e}")

    # Check revocation (in-memory cache first, then DB)
    jti = claims.get("jti")
    if jti and jti in _revoked_tokens:
        raise TokenRevokedError("Capability token has been revoked")

    return claims


async def revoke_token(jti: str, db: AsyncSession, reason: str = "emergency_revoke"):
    """
    Revoke a capability token. Writes to both in-memory cache and DB.
    The in-memory set serves as a fast cache; DB is the durable store.
    """
    from src.database.models import RevokedToken

    _revoked_tokens.add(jti)

    # Persist to DB
    revoked = RevokedToken(jti=jti, reason=reason)
    db.add(revoked)
    await db.flush()


async def load_revoked_tokens(db: AsyncSession):
    """
    Load revoked tokens from DB into in-memory cache.
    Call this at startup to restore revocation state.
    """
    from src.database.models import RevokedToken
    from datetime import datetime, timezone

    result = await db.execute(select(RevokedToken))
    for token in result.scalars().all():
        _revoked_tokens.add(token.jti)
    logger.info("Loaded %d revoked tokens from DB into cache", len(_revoked_tokens))


async def check_token_revoked_db(jti: str, db: AsyncSession) -> bool:
    """Check if a token is revoked in DB (for cache miss scenarios)."""
    from src.database.models import RevokedToken

    result = await db.execute(
        select(RevokedToken).where(RevokedToken.jti == jti)
    )
    revoked = result.scalar_one_or_none()
    if revoked:
        _revoked_tokens.add(jti)  # Update cache
        return True
    return False


def is_token_revoked(jti: str) -> bool:
    """Check if a token has been revoked (in-memory cache only)."""
    return jti in _revoked_tokens


def scope_matches(granted_scopes: list[str], required_scope: str) -> bool:
    """
    Check if the required scope is covered by any granted scope.
    Supports wildcard matching ONLY when the policy explicitly grants wildcards.

    The global wildcard "*" must be explicitly present in granted_scopes to
    match any scope. Wildcards are not implicitly expanded.

    Examples:
        granted: ["memory:write:cs:algorithms"], required: "memory:write:cs:algorithms" -> True
        granted: ["memory:write:*"], required: "memory:write:cs:algorithms" -> True
        granted: ["memory:*:*"], required: "memory:write:cs:algorithms" -> True
        granted: ["*"], required: "anything" -> True (explicit wildcard grant)
    """
    for scope in granted_scopes:
        if scope == required_scope:
            return True
        # Global wildcard only matches if explicitly granted as "*"
        if scope == "*":
            return True

        # Split into parts and compare
        granted_parts = scope.split(":")
        required_parts = required_scope.split(":")

        match = True
        for i, gp in enumerate(granted_parts):
            if gp == "*":
                # Explicit wildcard at this position matches remaining parts
                break
            if i >= len(required_parts):
                match = False
                break
            if gp != required_parts[i]:
                match = False
                break
        else:
            # All granted parts matched, but required might have more
            if len(required_parts) > len(granted_parts):
                match = False

        if match:
            return True

    return False


class SoulAuthContext:
    """Auth context injected into request.state by PEP middleware."""

    def __init__(
        self,
        soulkey_id: str,
        tenant_id: str,
        persona_id: str,
        scopes: list[str],
        capability_id: str,
    ):
        self.soulkey_id = soulkey_id
        self.tenant_id = tenant_id
        self.persona_id = persona_id
        self.scopes = scopes
        self.capability_id = capability_id
