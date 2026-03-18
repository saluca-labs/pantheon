"""
Policy Enforcement Point (PEP) middleware.
Implements SPEC.md section 6.2 — validates capability tokens on protected endpoints.
"""

import structlog
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from src.tokens.capability import (
    validate_capability_token,
    scope_matches,
    SoulAuthContext,
    TokenExpiredError,
    TokenInvalidError,
    TokenRevokedError,
)

logger = structlog.get_logger(__name__)

# Paths that require capability token validation
PROTECTED_PREFIXES = [
    "/v1/memory/",
    "/v1/vault/",
    "/v1/mesh/",
]

# Paths that are always open (no capability token needed)
OPEN_PREFIXES = [
    "/v1/auth/",
    "/v1/soulauth/admin/",
    "/v1/trial/",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
]


def _is_protected(path: str) -> bool:
    """Check if a path requires capability token enforcement."""
    for prefix in OPEN_PREFIXES:
        if path.startswith(prefix):
            return False
    for prefix in PROTECTED_PREFIXES:
        if path.startswith(prefix):
            return True
    return False


def _derive_scope_from_request(request: Request) -> str:
    """
    Derive the required scope from the request path and method.
    E.g., GET /v1/memory/cs/algorithms -> memory:read:cs:algorithms
    """
    path = request.url.path
    method = request.method.upper()

    # Map HTTP methods to actions
    method_action_map = {
        "GET": "read",
        "POST": "write",
        "PUT": "write",
        "PATCH": "write",
        "DELETE": "delete",
    }
    action = method_action_map.get(method, "read")

    # Extract resource and scope from path
    # /v1/memory/cs/algorithms -> resource=memory, scope=cs:algorithms
    parts = path.strip("/").split("/")
    if len(parts) >= 2:
        resource = parts[1]  # "memory", "vault", "mesh"
        scope_parts = parts[2:] if len(parts) > 2 else ["*"]
        scope = ":".join(scope_parts)
        return f"{resource}:{action}:{scope}"

    return f"unknown:{action}:*"


class SoulAuthPEPMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware — validates capability token on protected endpoints.
    Injects SoulAuthContext into request.state for downstream handlers.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path

        # Skip enforcement for non-protected paths
        if not _is_protected(path):
            return await call_next(request)

        # Extract capability token
        capability_token = request.headers.get("X-Capability-Token")
        if not capability_token:
            logger.warning("pep.missing_token", path=path)
            raise HTTPException(status_code=401, detail="Missing capability token")

        # Validate token
        try:
            claims = validate_capability_token(capability_token)
        except TokenExpiredError:
            logger.warning("pep.token_expired", path=path)
            raise HTTPException(status_code=401, detail="Capability token expired")
        except TokenRevokedError:
            logger.warning("pep.token_revoked", path=path)
            raise HTTPException(status_code=401, detail="Capability token revoked")
        except TokenInvalidError as e:
            logger.warning("pep.token_invalid", path=path, error=str(e))
            raise HTTPException(status_code=401, detail="Invalid capability token")

        # Derive required scope from request
        required_scope = _derive_scope_from_request(request)

        # Validate scope
        if not scope_matches(claims.get("scp", []), required_scope):
            logger.warning(
                "pep.scope_violation",
                path=path,
                required=required_scope,
                granted=claims.get("scp"),
            )
            raise HTTPException(
                status_code=403,
                detail=f"Scope {required_scope} not in capability token",
            )

        # Validate session binding
        session_id = request.headers.get("X-Session-ID", "")
        token_sid = claims.get("sid", "")
        if token_sid and token_sid != session_id:
            logger.warning("pep.session_mismatch", path=path)
            raise HTTPException(
                status_code=403, detail="Session binding mismatch"
            )

        # Inject auth context for downstream handlers
        request.state.soulauth = SoulAuthContext(
            soulkey_id=claims["sub"],
            tenant_id=claims["tid"],
            persona_id=claims.get("pid", ""),
            scopes=claims["scp"],
            capability_id=claims["jti"],
        )

        # Process request
        response = await call_next(request)

        logger.info(
            "pep.access_granted",
            path=path,
            persona=claims.get("pid"),
            scope=required_scope,
        )

        return response
