"""
SoulWatch Configuration Management.
Environment-based settings with SOULWATCH_ prefix.
"""

from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings


class SoulWatchSettings(BaseSettings):
    """Application settings loaded from SOULWATCH_ environment variables."""

    # Application
    app_name: str = "SoulWatch"
    app_version: str = "1.0.0"
    debug: bool = False
    log_level: str = "INFO"

    # Operating mode: "sidecar" (polls SoulAuth audit table) or "standalone" (receives events via API)
    mode: str = Field(
        default="sidecar",
        description="Operating mode: 'sidecar' (polls audit table) or 'standalone' (receives events via API)",
    )

    # SoulAuth integration
    soulauth_base_url: str = Field(
        default="http://localhost:8000",
        description="Base URL for SoulAuth admin API callbacks (e.g. suspend key)",
    )

    # Database (same Postgres as SoulAuth)
    database_url: str = Field(
        default="postgresql+asyncpg://saluca:saluca@100.101.95.99:5432/soulauth",
        description="Async database connection URL (shared DB with SoulAuth)",
    )
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30

    # Detection engine
    detection_enabled: bool = True
    detection_rules_dir: Optional[str] = Field(
        default=None,
        description="Path to directory containing Sigma rule YAML files",
    )
    detection_playbooks_dir: Optional[str] = Field(
        default=None,
        description="Path to directory containing response playbook YAML files",
    )

    # SIEM Integration
    siem_enabled: bool = False
    siem_buffer_size: int = 100
    siem_flush_interval: int = 30
    siem_destinations: Optional[str] = Field(
        default=None,
        description="JSON-encoded list of SIEM destination configs",
    )

    # Notification channels
    notifications_enabled: bool = False
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    pagerduty_routing_key: Optional[str] = None
    slack_webhook_url: Optional[str] = None
    teams_webhook_url: Optional[str] = None
    opsgenie_api_key: Optional[str] = None
    email_smtp_host: Optional[str] = None
    email_smtp_port: int = 587
    email_smtp_user: Optional[str] = None
    email_smtp_password: Optional[str] = None
    email_from: Optional[str] = None
    email_to: Optional[str] = Field(
        default=None,
        description="Comma-separated list of recipient email addresses",
    )
    sns_topic_arn: Optional[str] = None
    notification_severity_threshold: str = "medium"

    # Internal API key for inter-service authentication (event ingestion, metrics)
    internal_api_key: Optional[str] = Field(
        default=None,
        description="Shared secret for authenticating inter-service requests (X-Internal-Key header)",
    )

    # Resend (transactional email for alert emails)
    resend_api_key: Optional[str] = None

    # Baseline engine
    baseline_rebuild_interval_hours: int = 6
    baseline_lookback_hours: int = 168  # 7 days

    # Retention
    anomaly_retention_days: int = 90
    detection_retention_days: int = 90

    # Pipeline
    poll_interval_seconds: int = 5  # Sidecar mode: poll interval for audit table
    pipeline_batch_size: int = 100

    # WebSocket
    ws_max_connections: int = 100
    ws_heartbeat_interval: int = 30

    # Server
    host: str = "0.0.0.0"
    port: int = 8001

    model_config = {
        "env_prefix": "SOULWATCH_",
        "env_file": ".env",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> SoulWatchSettings:
    return SoulWatchSettings()
