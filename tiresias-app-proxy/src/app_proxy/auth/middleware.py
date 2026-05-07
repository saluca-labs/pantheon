"""Auth middleware — API key extraction, verification, and tenant context."""

from __future__ import annotations

import hashlib
import hmac
from typing import Any

import structlog
from fastapi import HTTPException, Request

from app_proxy.config import Settings

logger = structlog.stdlib.get_logger("app_proxy.auth.middleware")


def extract_api_key(request: Request) -> str | None:
    """Extract the bearer token from the Authorization header.

    Returns ``None`` if the header is absent or malformed.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    return auth_header[7:].strip() or None


def _hash_key(key: str) -> str:
    """SHA-256 hex digest of a key string."""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def verify_request(request: Request, settings: Settings) -> dict[str, Any]:
    """Authenticate the inbound request and return a tenant context dict.

    Raises ``HTTPException(401)`` if:
    - The settings have an ``api_key_hash`` configured and the request
      does not carry a matching bearer token.

    When ``api_key_hash`` is ``None`` (dev mode), all requests pass through
    with a default context.
    """
    # If no key configured, allow all (development mode)
    if settings.api_key_hash is None:
        logger.debug("auth.dev_mode", note="no api_key_hash configured, allowing")
        return {
            "tenant_id": str(settings.tenant_id),
            "authenticated": False,
            "mode": "dev",
        }

    api_key = extract_api_key(request)
    if api_key is None:
        logger.warning("auth.missing_key", path=request.url.path)
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    candidate_hash = _hash_key(api_key)
    if not hmac.compare_digest(candidate_hash, settings.api_key_hash):
        logger.warning("auth.invalid_key", path=request.url.path)
        raise HTTPException(status_code=401, detail="Invalid API key")

    return {
        "tenant_id": str(settings.tenant_id),
        "authenticated": True,
        "mode": "production",
    }


def verify_admin_key(request: Request, settings: Settings) -> None:
    """Verify the X-Admin-Key header for admin endpoints.

    Raises ``HTTPException(401)`` if the key is missing or does not match.
    """
    if settings.admin_key is None:
        logger.debug("auth.admin.dev_mode", note="no admin_key configured, allowing")
        return

    provided = request.headers.get("X-Admin-Key", "")
    if not provided:
        raise HTTPException(status_code=401, detail="Missing X-Admin-Key header")

    if not hmac.compare_digest(provided, settings.admin_key):
        logger.warning("auth.admin.invalid_key", path=request.url.path)
        raise HTTPException(status_code=401, detail="Invalid admin key")
