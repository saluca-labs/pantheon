"""
platform_auth — Local-auth default for Python services.

Exports:
  hash_password, verify_password         — Argon2id
  create_session, validate_session,
  invalidate_session                     — Postgres sessions
  get_current_user                       — FastAPI dependency
  require_role                           — role-check decorator
"""

from .password import hash_password, verify_password
from .session import create_session, validate_session, invalidate_session
from .dependencies import get_current_user, require_role
from .bff import BffIdentity, get_bff_identity, require_bff_role

__all__ = [
    "hash_password",
    "verify_password",
    "create_session",
    "validate_session",
    "invalidate_session",
    "get_current_user",
    "require_role",
    "BffIdentity",
    "get_bff_identity",
    "require_bff_role",
]
