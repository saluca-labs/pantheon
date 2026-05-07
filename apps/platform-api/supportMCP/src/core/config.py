"""Configuration for Tiresias Support MCP."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    database_url: str = "postgresql+asyncpg://localhost/tiresias"
    cloud_logging_project: str = ""
    # Deployment-time pin; every tool call still verifies the caller's derived
    # tenant_id matches this scope. Empty = single-tenant dev mode.
    support_mcp_tenant_scope: str = ""

    host: str = "0.0.0.0"
    port: int = 3000
    log_level: str = "INFO"


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
