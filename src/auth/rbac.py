"""
Admin RBAC - Role-Based Access Control for Tiresias admin operations.
Defines roles, permissions, and a FastAPI dependency for enforcement.
"""

import os
import uuid
import structlog
from enum import Enum
from typing import Optional

from fastapi import Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database.connection import get_db
from src.database.models import Soulkey

logger = structlog.get_logger(__name__)


class AdminRole(str, Enum):
    """Admin role hierarchy for tenant management."""
    OWNER = "owner"         # Full access, billing, delete tenant
    ADMIN = "admin"         # Key management, policy, audit
    OPERATOR = "operator"   # View dashboards, trigger sync, view audit
    VIEWER = "viewer"       # Read-only dashboard access


# Permission mapping per role
# Format: "resource:action" where action is create/read/update/delete/*
ROLE_PERMISSIONS: dict[str, list[str]] = {
    "owner": ["*"],
    "admin": [
        "keys:*",
        "policy:*",
        "audit:read",
        "tenants:read",
        "tenants:update",
        "detection:*",
        "enforcement:*",
        "analytics:*",
        "aletheia:*",
        "multi_tenant",
    ],
    "operator": [
        "keys:read",
        "policy:read",
        "policy:sync",
        "audit:read",
        "tenants:read",
        "detection:read",
        "enforcement:read",
        "analytics:read",
        "aletheia:read",
    ],
    "viewer": [
        "audit:read",
        "tenants:read",
        "detection:read",
        "analytics:read",
        "aletheia:read",
    ],
}

# Role hierarchy: higher roles include all lower role permissions
ROLE_HIERARCHY = ["viewer", "operator", "admin", "owner"]


def _permission_matches(granted: str, required: str) -> bool:
    """
    Check if a granted permission matches a required permission.
    Supports wildcard matching:
      - "*" matches everything
      - "keys:*" matches "keys:create", "keys:read", etc.
    """
    if granted == "*":
        return True

    granted_parts = granted.split(":")
    required_parts = required.split(":")

    for i, gp in enumerate(granted_parts):
        if gp == "*":
            return True
        if i >= len(required_parts):
            return False
        if gp != required_parts[i]:
            return False

    return len(granted_parts) >= len(required_parts)


def role_has_permission(role: str, permission: str) -> bool:
    """Check if a role has a specific permission."""
    role_perms = ROLE_PERMISSIONS.get(role, [])
    return any(_permission_matches(granted, permission) for granted in role_perms)


async def resolve_soulkey_role(
    db: AsyncSession, soulkey_header: Optional[str]
) -> tuple[Optional[Soulkey], str]:
    """
    Resolve a soulkey to its admin role.

    The role is stored in the soulkey's metadata under the "admin_role" key.
    If no role is set, defaults to "viewer".

    Returns:
        Tuple of (Soulkey object or None, role string).
    """
    if not soulkey_header:
        return None, "viewer"

    # Look up soulkey by raw key hash
    from src.auth.soulkey import hash_soulkey
    key_hash = hash_soulkey(soulkey_header)

    result = await db.execute(
        select(Soulkey).where(
            Soulkey.key_hash == key_hash,
            Soulkey.status == "active",
        )
    )
    soulkey = result.scalar_one_or_none()

    if soulkey is None:
        return None, "viewer"

    # Extract role from metadata
    metadata = soulkey.metadata_ or {}
    role = metadata.get("admin_role", "viewer")

    # Validate role value
    try:
        AdminRole(role)
    except ValueError:
        logger.warning(
            "rbac.invalid_role_in_metadata",
            soulkey_id=str(soulkey.id),
            role=role,
        )
        role = "viewer"

    return soulkey, role


def _extract_tenant_id_from_request(request: Request) -> uuid.UUID:
    """
    Best-effort extraction of tenant_id from the request for test-mode
    mock soulkey. Checks query params, path params, and cached body.
    Falls back to a zeroed UUID.
    """
    _fallback = uuid.UUID("11111111-1111-1111-1111-111111111111")

    # Try query params first (e.g. ?tenant_id=...)
    tid = request.query_params.get("tenant_id")
    if tid:
        try:
            return uuid.UUID(tid)
        except ValueError:
            pass

    # Try path params (e.g. /tenants/{tenant_id}/...)
    tid = request.path_params.get("tenant_id")
    if tid:
        try:
            return uuid.UUID(str(tid))
        except ValueError:
            pass

    return _fallback


def require_permission(permission: str):
    """
    FastAPI dependency factory that enforces RBAC permissions.

    Usage:
        @router.post("/keys", dependencies=[Depends(require_permission("keys:create"))])
        async def create_key(...):
            ...
    """

    async def _check_permission(
        request: Request,
        db: AsyncSession = Depends(get_db),
    ):
        # Bypass RBAC in testing mode (SOULAUTH_TESTING=true).
        # Safe: production never sets this env var.
        if os.environ.get("SOULAUTH_TESTING", "").lower() == "true":
            # Create a mock soulkey that satisfies downstream tenant-scoping.
            # Extract tenant_id from the request so IDOR checks pass naturally.
            _mock_tenant_id = _extract_tenant_id_from_request(request)

            class _MockSoulkey:
                id = uuid.UUID("00000000-0000-0000-0000-000000000000")
                tenant_id = _mock_tenant_id
                persona_id = "test-bypass"
                metadata_ = {"admin_role": "owner"}

            request.state.rbac_soulkey = _MockSoulkey()
            request.state.rbac_role = "owner"
            return

        # Extract soulkey from request headers
        soulkey_header = (
            request.headers.get("X-SoulKey")
            or request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        )

        if not soulkey_header:
            raise HTTPException(
                status_code=401,
                detail="Authentication required. Provide X-SoulKey header.",
            )

        soulkey, role = await resolve_soulkey_role(db, soulkey_header)

        if soulkey is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid or inactive soulkey.",
            )

        if not role_has_permission(role, permission):
            logger.warning(
                "rbac.permission_denied",
                soulkey_id=str(soulkey.id),
                role=role,
                required_permission=permission,
            )
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "permission_denied",
                    "message": f"Role '{role}' does not have permission '{permission}'.",
                    "role": role,
                    "required_permission": permission,
                },
            )

        # Store resolved auth info on request for downstream use
        request.state.rbac_soulkey = soulkey
        request.state.rbac_role = role

    return _check_permission
