"""Pydantic Settings model for platform environment variables."""

from enum import Enum
from functools import lru_cache
from typing import Literal, Optional

from pydantic import AnyUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
