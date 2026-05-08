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
from .tokens import (
    issue_password_reset_token,
    consume_password_reset_token,
    issue_email_verification_token,
    consume_email_verification_token,
)
from .oidc import (
    OidcAdapter,
    OidcNotConfiguredError,
    NotConfiguredAdapter,
    get_oidc_adapter,
    register_adapter,
    auth_mode,
    is_oidc_enabled,
)

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
    "issue_password_reset_token",
    "consume_password_reset_token",
    "issue_email_verification_token",
    "consume_email_verification_token",
    "OidcAdapter",
    "OidcNotConfiguredError",
    "NotConfiguredAdapter",
    "get_oidc_adapter",
    "register_adapter",
    "auth_mode",
    "is_oidc_enabled",
]
