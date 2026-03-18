"""
SoulGate Configuration Management.
Environment-based settings with SOULGATE_ prefix.
"""

from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings


class SoulGateSettings(BaseSettings):
    """Application settings loaded from SOULGATE_ environment variables."""

    # Application
    app_name: str = "SoulGate"
    app_version: str = "1.0.0"
    debug: bool = False
    log_level: str = "INFO"

    # Operating mode
    mode: str = Field(
        default="gateway",
        description="Operating mode: 'gateway' (reverse proxy with security pipeline)",
    )

    # SoulAuth integration
    soulauth_base_url: str = Field(
        default="http://localhost:8000",
        description="Base URL for SoulAuth API (token validation, identity resolution)",
    )

    # SoulWatch integration
    soulwatch_base_url: str = Field(
        default="http://localhost:8001",
        description="Base URL for SoulWatch API (event forwarding)",
    )

    # Database (same Postgres as SoulAuth)
    database_url: str = Field(
        default="postgresql+asyncpg://saluca:saluca@100.101.95.99:5432/soulauth",
        description="Async database connection URL (shared DB with SoulAuth)",
    )
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30

    # Rate limiting
    default_rate_limit_rpm: int = Field(
        default=60,
        description="Default requests per minute for rate limiting",
    )
    default_burst_size: int = Field(
        default=10,
        description="Default burst size above rate limit before hard reject",
    )

    # Audit logging
    audit_batch_size: int = Field(
        default=50,
        description="Number of audit log entries to batch before flushing to DB",
    )
    audit_flush_interval: int = Field(
        default=5,
        description="Seconds between audit log flushes",
    )

    # Circuit breaker
    circuit_failure_threshold: int = Field(
        default=5,
        description="Number of consecutive failures before circuit opens",
    )
    circuit_cooldown_seconds: int = Field(
        default=30,
        description="Seconds to wait in open state before half-open probe",
    )

    # Proxy
    proxy_timeout_ms: int = Field(
        default=30000,
        description="Upstream proxy request timeout in milliseconds",
    )
    max_request_body_bytes: int = Field(
        default=10485760,
        description="Maximum request body size (10 MB default)",
    )

    # Internal API key for inter-service authentication (metrics endpoint)
    internal_api_key: Optional[str] = Field(
        default=None,
        description="Shared secret for authenticating internal requests (e.g. Prometheus scraping)",
    )

    # Prompt guard
    prompt_guard_enabled: bool = Field(
        default=True,
        description="Enable prompt injection detection on request bodies",
    )

    # Server
    host: str = "0.0.0.0"
    port: int = 8002

    model_config = {
        "env_prefix": "SOULGATE_",
        "env_file": ".env",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> SoulGateSettings:
    return SoulGateSettings()
