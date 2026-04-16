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
    app_version: str = "2.5.0"
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

    # Database — dual backend support
    # When set to a postgresql+asyncpg:// URL: shared Postgres engine.
    # When empty/None: per-tenant SQLite under data_root.
    database_url: Optional[str] = Field(
        default=None,
        description=(
            "Async database connection URL. "
            "Set to a postgresql+asyncpg:// URL for shared Postgres, "
            "or leave unset for per-tenant SQLite."
        ),
    )
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30

    # Data root — base directory for per-tenant SQLite files (ignored with Postgres)
    data_root: str = Field(
        default="/data",
        description="Root directory for per-tenant SQLite databases (used when database_url is unset)",
    )

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

    # CoT policy enforcement
    cot_policy_enabled: bool = Field(
        default=False,
        description="Enable CoT policy enforcement (inject/reject/warn thinking on requests)",
    )
    cot_policy_dir: str = Field(
        default="policies/cot",
        description="Directory containing CotPolicy YAML files",
    )

    # PicoClaw integration (action pipeline)
    picoclaw_base_url: str = Field(
        default="http://localhost:18790",
        description="Base URL for PicoClaw gateway (action forwarding)",
    )
    picoclaw_action_token: Optional[str] = Field(
        default=None,
        description="Shared secret for authenticating action submissions",
    )

    # Server
    host: str = "0.0.0.0"
    port: int = Field(default=8002, validation_alias="SOULGATE_SERVER_PORT")

    model_config = {
        "env_prefix": "SOULGATE_",
        "env_file": ".env",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> SoulGateSettings:
    return SoulGateSettings()
