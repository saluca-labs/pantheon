"""
Edge token validation and SoulAuth callback.
Supports:
1. JWT ES256 capability tokens (local validation)
2. SoulAuth remote evaluation (/v1/auth/evaluate)
3. SoulGate API keys (bcrypt hash lookup)
"""

import uuid
from dataclasses import dataclass, field
from typing import Optional

import httpx
import structlog
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from soulGate.config.settings import get_settings
from soulGate.src.database.models import SoulGateAPIKey
from soulGate.src.auth.apikey import verify_api_key

logger = structlog.get_logger(__name__)
settings = get_settings()


@dataclass
class AuthResult:
    """Result of authentication validation."""
    authenticated: bool = False
    auth_method: str = ""  # token, apikey, soulauth
    tenant_id: Optional[uuid.UUID] = None
    soulkey_id: Optional[uuid.UUID] = None
    persona_id: Optional[str] = None
    api_key_id: Optional[uuid.UUID] = None
    scopes: list[str] = field(default_factory=list)
    error: Optional[str] = None


async def validate_request_auth(
    request: Request,
    db: AsyncSession,
) -> AuthResult:
    """
    Validate request authentication.
    Checks in order:
    1. X-API-Key header -> SoulGate API key
    2. Authorization: Bearer -> JWT capability token via SoulAuth
    3. X-SoulKey header -> SoulAuth identity resolution
    """
    # 1. Check SoulGate API key
    api_key = request.headers.get("x-api-key")
    if api_key:
        return await _validate_api_key(api_key, db)

    # 2. Check Bearer token
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        return await _validate_bearer_token(token)

    # 3. Check SoulKey header
    soulkey = request.headers.get("x-soulkey")
    if soulkey:
        return await _validate_soulkey(soulkey)

    return AuthResult(
        authenticated=False,
        error="No authentication credentials provided. Use X-API-Key, Authorization: Bearer, or X-SoulKey header.",
    )


async def _validate_api_key(raw_key: str, db: AsyncSession) -> AuthResult:
    """Validate a SoulGate API key by prefix lookup and bcrypt verification."""
    # Extract prefix (first 8 chars after sg_)
    prefix = raw_key[:8] if len(raw_key) >= 8 else raw_key

    result = await db.execute(
        select(SoulGateAPIKey).where(
            SoulGateAPIKey.key_prefix == prefix,
            SoulGateAPIKey.status == "active",
        )
    )
    candidates = result.scalars().all()

    for key_record in candidates:
        if verify_api_key(raw_key, key_record.key_hash):
            # Check expiry
            if key_record.expires_at:
                from datetime import datetime, timezone
                if datetime.now(timezone.utc) > key_record.expires_at:
                    return AuthResult(
                        authenticated=False,
                        error="API key expired",
                    )

            return AuthResult(
                authenticated=True,
                auth_method="apikey",
                tenant_id=key_record.tenant_id,
                api_key_id=key_record.id,
                scopes=key_record.scopes or [],
            )

    logger.warning("auth.api_key_invalid", prefix=prefix)
    return AuthResult(
        authenticated=False,
        error="Invalid API key",
    )


async def _validate_bearer_token(token: str) -> AuthResult:
    """Validate JWT capability token by calling SoulAuth GET /v1/auth/identity."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{settings.soulauth_base_url}/v1/auth/identity",
                headers={"X-Soulkey": token},
            )

        if response.status_code == 200:
            data = response.json()
            if data.get("status") != "active":
                return AuthResult(
                    authenticated=False,
                    error=f"Token identity status: {data.get('status', 'unknown')}",
                )
            return AuthResult(
                authenticated=True,
                auth_method="token",
                tenant_id=_parse_uuid(data.get("tenant_id")),
                soulkey_id=_parse_uuid(data.get("soulkey_id")),
                persona_id=data.get("persona_id"),
                scopes=[],
            )

        if response.status_code == 401:
            return AuthResult(
                authenticated=False,
                error="Invalid or expired capability token",
            )

        logger.warning("auth.soulauth_error", status=response.status_code)
        return AuthResult(
            authenticated=False,
            error=f"SoulAuth returned {response.status_code}",
        )

    except httpx.ConnectError:
        logger.error("auth.soulauth_unreachable")
        return AuthResult(
            authenticated=False,
            error="SoulAuth service unreachable",
        )
    except Exception as e:
        logger.error("auth.token_validation_failed", error=str(e))
        return AuthResult(
            authenticated=False,
            error="Token validation failed",
        )


async def _validate_soulkey(raw_key: str) -> AuthResult:
    """Validate SoulKey by calling SoulAuth GET /v1/auth/identity."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{settings.soulauth_base_url}/v1/auth/identity",
                headers={"X-Soulkey": raw_key},
            )

        if response.status_code == 200:
            data = response.json()
            if data.get("status") != "active":
                return AuthResult(
                    authenticated=False,
                    error=f"SoulKey identity status: {data.get('status', 'unknown')}",
                )
            return AuthResult(
                authenticated=True,
                auth_method="soulkey",
                tenant_id=_parse_uuid(data.get("tenant_id")),
                soulkey_id=_parse_uuid(data.get("soulkey_id")),
                persona_id=data.get("persona_id"),
            )

        if response.status_code == 401:
            return AuthResult(
                authenticated=False,
                error="Invalid SoulKey",
            )

        logger.warning("auth.soulauth_error", status=response.status_code)
        return AuthResult(
            authenticated=False,
            error=f"SoulAuth returned {response.status_code}",
        )

    except httpx.ConnectError:
        logger.error("auth.soulauth_unreachable")
        return AuthResult(
            authenticated=False,
            error="SoulAuth service unreachable",
        )
    except Exception as e:
        logger.error("auth.soulkey_validation_failed", error=str(e))
        return AuthResult(
            authenticated=False,
            error="SoulKey validation failed",
        )


def _parse_uuid(value) -> Optional[uuid.UUID]:
    """Safely parse a UUID from a string."""
    if value is None:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None
