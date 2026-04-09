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
from src.auth.oidc_session import validate_session

logger = structlog.get_logger(__name__)


class AdminRole(str, Enum):
    """Admin role hierarchy for tenant management."""
    OWNER = "owner"         # Full access, billing, delete tenant
    ADMIN = "admin"         # Key management, policy, audit
    OPERATOR = "operator"   # View dashboards, trigger sync, view audit
    VIEWER = "viewer"       # Read-only dashboard access


# Permission mapping per role (defaults)
# Format: "resource:action" where action is create/read/update/delete/*
# Privacy: Database-backed overrides allow tenant-specific RBAC.
DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "owner": ["*"],
    "admin": [
        "keys:*",
        "policy:*",
        "audit:read",
        "tenants:read",
        "tenants:update",
        "tenants:create",
        "detection:*",
        "enforcement:*",
        "analytics:*",
        "aletheia:*",
        "users:*",
        "teams:*",
        "invites:*",
        "multi_tenant",
        "hierarchy:manage",
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
        "users:read",
        "teams:read",
    ],
    "viewer": [
        "audit:read",
        "tenants:read",
        "policy:read",
        "detection:read",
        "analytics:read",
        "aletheia:read",
        "keys:read",
        "enforcement:read",
        "users:read",
        "teams:read",
    ],
}

# Runtime cache for role permissions (database-backed with Redis cache)
_role_permissions_cache: dict[str, list[str]] | None = None


def _load_role_permissions(tenant_id: uuid.UUID | None = None) -> dict[str, list[str]]:
    """
    Load role permissions from database with optional tenant scoping.
    Privacy: Tenant-specific RBAC overrides supported.
    Compliance: All permission changes audit-logged.
    """
    global _role_permissions_cache
    cache_key = f"tenant:{tenant_id}" if tenant_id else "global"

    if _role_permissions_cache is not None:
        return _role_permissions_cache

    try:
        from src.database.connection import get_db_session
        from src.database.models import RolePermission

        db = get_db_session()
        query = db.query(RolePermission)
        if tenant_id:
            query = query.filter(RolePermission.tenant_id == tenant_id)
        else:
            query = query.filter(RolePermission.tenant_id.is_(None))

        rows = query.all()

        permissions: dict[str, list[str]] = {}
        for row in rows:
            if row.role_name not in permissions:
                permissions[row.role_name] = []
            permissions[row.role_name].append(row.permission)

        # Merge with defaults (database overrides extend defaults)
        for role, default_perms in DEFAULT_ROLE_PERMISSIONS.items():
            if role not in permissions:
                permissions[role] = default_perms
            else:
                # Database perms extend defaults
                permissions[role] = list(set(permissions[role] + default_perms))

        _role_permissions_cache = permissions
        return permissions
    except Exception as e:
        logger.warning("rbac.permissions.load_failed", error=str(e))
        return DEFAULT_ROLE_PERMISSIONS


def get_role_permissions(role: str, tenant_id: uuid.UUID | None = None) -> list[str]:
    """Get permissions for a role, with database override support."""
    permissions = _load_role_permissions(tenant_id)
    return permissions.get(role, [])


def invalidate_rbac_cache() -> None:
    """Invalidate RBAC permissions cache (call after database updates)."""
    global _role_permissions_cache
    _role_permissions_cache = None
    logger.debug("rbac.cache.invalidated")

# Role hierarchy: higher roles include all lower role permissions
ROLE_HIERARCHY = ["viewer", "operator", "admin", "owner"]

# Account admin permissions (checked via is_account_admin flag, not role)
ACCOUNT_ADMIN_PERMISSIONS = [
    "users:create", "users:read", "users:update", "users:delete",
    "teams:create", "teams:read", "teams:update", "teams:delete",
    "invites:create", "invites:read", "invites:revoke",
    "account:secondary_admin",
]

SECONDARY_ADMIN_PERMISSIONS = [
    "users:create", "users:read", "users:update", "users:delete",
    "teams:create", "teams:read", "teams:update", "teams:delete",
    "invites:create", "invites:read", "invites:revoke",
]

# Team-level permissions
TEAM_ROLE_PERMISSIONS = {
    "team_admin": ["team_members:*", "team:update", "team:read"],
    "analyst": ["team:read", "investigations:*", "detections:create", "detections:update"],
    "member": ["team:read", "investigations:read", "detections:read"],
}


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


def role_has_permission(role: str, permission: str, tenant_id: uuid.UUID | None = None) -> bool:
    """
    Check if a role has a specific permission.
    Privacy: Supports tenant-specific permission overrides.
    """
    role_perms = get_role_permissions(role, tenant_id)
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

    # Try X-Tenant-ID header first (most common in testing)
    tid = request.headers.get("X-Tenant-ID")
    if tid:
        try:
            return uuid.UUID(tid)
        except ValueError:
            pass

    # Try query params (e.g. ?tenant_id=...)
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
        # Bypass RBAC in testing mode.
        # Requires BOTH:
        #   SOULAUTH_TESTING=true      (test flag)
        #   ENVIRONMENT != production  (production guard)
        # This prevents accidental or malicious activation in prod deployments.
        _is_testing = os.environ.get("SOULAUTH_TESTING", "").lower() == "true"
        _env = os.environ.get("ENVIRONMENT", "production").lower()
        if _is_testing and _env != "production":
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

        # Service-to-service auth via X-Internal-Key (portal → soulwatch/soulgate)
        _internal_key = request.headers.get("X-Internal-Key")
        if _internal_key:
            _expected = os.environ.get("SOULWATCH_INTERNAL_API_KEY") or os.environ.get("INTERNAL_API_KEY", "")
            if _internal_key == _expected and _expected:
                _mock_tenant_id = _extract_tenant_id_from_request(request)

                class _ServiceSoulkey:
                    id = uuid.UUID("00000000-0000-0000-0000-000000000001")
                    tenant_id = _mock_tenant_id
                    persona_id = "service-internal"
                    metadata_ = {"admin_role": "admin"}

                request.state.rbac_soulkey = _ServiceSoulkey()
                request.state.rbac_role = "admin"
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
            # Fallback: try OIDC/local session token
            session_result = await validate_session(db, soulkey_header)
            if session_result:
                _session, user = session_result
                role = user.admin_role or "viewer"
                _mock_tenant_id = _extract_tenant_id_from_request(request)

                class _OIDCSoulkey:
                    id = user.id
                    tenant_id = _mock_tenant_id or user.tenant_id
                    persona_id = "oidc-session"
                    metadata_ = {"admin_role": role}

                soulkey = _OIDCSoulkey()
            else:
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


# ---------------------------------------------------------------------------
# OIDC session user support in require_permission
# ---------------------------------------------------------------------------

async def resolve_oidc_user_role(request: Request) -> tuple:
    """
    Attempt to resolve an OIDC portal user from the request state.
    Returns (SoulUser, role) or (None, None).
    Set by pep.resolve_oidc_context() before this is called.
    """
    oidc_user = getattr(request.state, "oidc_user", None)
    if oidc_user is None:
        return None, None
    role = oidc_user.admin_role or "viewer"
    try:
        AdminRole(role)
    except ValueError:
        role = "viewer"
    return oidc_user, role


# ---------------------------------------------------------------------------
# Hierarchy permission check for delegated admin
# ---------------------------------------------------------------------------

async def check_hierarchy_permission(
    db: AsyncSession,
    caller_tenant_id: uuid.UUID,
    target_tenant_id: uuid.UUID,
    permission: str,
) -> bool:
    """
    Check if caller_tenant_id has permission over target_tenant_id.
    Returns True if:
    1. caller == target (same tenant), OR
    2. target is a descendant of caller in the hierarchy
    """
    if caller_tenant_id == target_tenant_id:
        return True
    try:
        from src.mssp.isolation import get_child_tenant_ids
        child_ids = await get_child_tenant_ids(db, caller_tenant_id, include_root=False)
        return target_tenant_id in child_ids
    except Exception:
        logger.warning(
            "rbac.hierarchy_check_failed",
            caller_tenant_id=str(caller_tenant_id),
            target_tenant_id=str(target_tenant_id),
            permission=permission,
        )
        return False
