"""
RBAC middleware utilities for Tiresias admin API.
Re-exports core RBAC functions and provides additional middleware helpers.
"""

from src.auth.rbac import (
    AdminRole,
    ROLE_PERMISSIONS,
    ROLE_HIERARCHY,
    require_permission,
    role_has_permission,
    resolve_soulkey_role,
)

__all__ = [
    "AdminRole",
    "ROLE_PERMISSIONS",
    "ROLE_HIERARCHY",
    "require_permission",
    "role_has_permission",
    "resolve_soulkey_role",
]
