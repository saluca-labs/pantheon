"""Pydantic Settings model for platform environment variables.

Values may be specified as plain literals (the common case) or as secret
references understood by ``platform_secrets`` (e.g. ``vault://...``,
``awssm://...``, ``file:///...``). When a reference is detected during
``get_settings()`` the secrets facade resolves it before pydantic
validates the model, so the rest of the codebase only ever sees the
resolved literal value.

The import of ``platform_secrets`` is best-effort: if the package isn't
installed (e.g. an old service vendoring just ``platform_config``), the
resolver becomes a no-op pass-through and references go through pydantic
unchanged. This keeps the dependency optional.
"""

import os
from enum import Enum
from functools import lru_cache
from typing import Literal, Optional

from pydantic import AnyUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

try:
    from platform_secrets import get_facade as _get_secrets_facade
    from platform_secrets.facade import _DEFAULT_FACTORIES as _SECRET_DEFAULT_SCHEMES

    def _is_known_secret_reference(value: str) -> bool:
        """True iff the value's scheme is registered with the facade.

        Includes both built-in schemes (env/file/vault/awssm/gcpsm) and any
        backends the app explicitly registered via ``configure(...)``.
        ``postgres://...`` is intentionally NOT a secret reference — it's
        a literal Postgres URL.
        """
        if not isinstance(value, str):
            return False
        idx = value.find("://")
        if idx <= 0:
            return False
        scheme = value[:idx]
        if scheme in _SECRET_DEFAULT_SCHEMES:
            return True
        return scheme in _get_secrets_facade().backends

    def _resolve_secret_value(value: str):
        return _get_secrets_facade().resolve(value)

except ImportError:  # pragma: no cover — platform_secrets is optional
    def _is_known_secret_reference(value: str) -> bool:  # type: ignore[misc]
        return False

    def _resolve_secret_value(value: str):  # type: ignore[misc]
        return value


class NodeEnv(str, Enum):
    development = "development"
    test = "test"
    production = "production"


class AuthMode(str, Enum):
    local = "local"
    oidc = "oidc"


class LogLevel(str, Enum):
    debug = "debug"
    info = "info"
    warning = "warning"
    error = "error"
    critical = "critical"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Runtime
    NODE_ENV: NodeEnv = NodeEnv.development

    # Database
    DATABASE_URL: str = Field(..., min_length=1)

    # Auth
    AUTH_MODE: AuthMode = AuthMode.local
    SESSION_SECRET: str = Field(..., min_length=32)
    COOKIE_DOMAIN: Optional[str] = None

    # Public URLs
    WEB_PUBLIC_URL: str = Field(..., min_length=1)
    API_PUBLIC_URL: str = Field(..., min_length=1)

    # Optional SMTP
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: Optional[int] = None
    SMTP_FROM: Optional[str] = None

    # Optional Redis
    REDIS_URL: Optional[str] = None

    # Observability
    LOG_LEVEL: LogLevel = LogLevel.info

    @field_validator("SESSION_SECRET")
    @classmethod
    def validate_session_secret(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("SESSION_SECRET must be at least 32 characters long")
        return v


_SECRET_RESOLVABLE_VARS = (
    "DATABASE_URL",
    "SESSION_SECRET",
    "SMTP_HOST",
    "SMTP_FROM",
    "REDIS_URL",
    "COOKIE_DOMAIN",
)


def _resolve_env_secret_references() -> None:
    """Replace ``vault://`` / ``awssm://`` etc. env values with their resolved
    literals so pydantic-settings sees only plain strings.

    Mutates ``os.environ`` in place; safe to call multiple times because
    the second pass becomes a no-op once the values are literals.
    """
    for var in _SECRET_RESOLVABLE_VARS:
        raw = os.environ.get(var)
        if not raw or not _is_known_secret_reference(raw):
            continue
        resolved = _resolve_secret_value(raw)
        if resolved is not None and resolved != raw:
            os.environ[var] = resolved


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    _resolve_env_secret_references()
    return Settings()  # type: ignore[call-arg]
