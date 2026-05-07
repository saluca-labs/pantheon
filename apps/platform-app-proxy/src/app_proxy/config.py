"""App Proxy configuration — Pydantic BaseSettings with APP_PROXY_ env prefix."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Literal, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Tiresias App Proxy settings.

    Every field can be overridden via environment variables prefixed with
    ``APP_PROXY_`` (e.g. ``APP_PROXY_PROXY_PORT=9090``).
    """

    model_config = SettingsConfigDict(
        env_prefix="APP_PROXY_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ---------- identity ----------
    tenant_id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        description="Unique tenant identifier for multi-tenant isolation.",
    )

    # ---------- network ----------
    proxy_port: int = Field(
        default=8081,
        description="Port the App Proxy listens on.",
    )

    # ---------- storage ----------
    database_url: str = Field(
        default="sqlite+aiosqlite:///app_proxy.db",
        description="Async SQLAlchemy database URL.",
    )

    # ---------- paths ----------
    plugins_dir: Path = Field(
        default=Path("plugins"),
        description="Directory containing MCP plugin manifests.",
    )
    policies_dir: Path = Field(
        default=Path("policies/cedar"),
        description="Directory containing .cedar policy files.",
    )
    cedar_schema_path: Path = Field(
        default=Path("src/app_proxy/policy/schema.json"),
        description="Path to the Cedar schema definition.",
    )

    # ---------- timeouts ----------
    mcp_server_timeout_seconds: int = Field(
        default=30,
        description="Seconds before an MCP server call is considered timed-out.",
    )

    # ---------- policy ----------
    policy_enforcement_mode: Literal["strict", "advisory"] = Field(
        default="strict",
        description=(
            "'strict' denies actions that fail policy; "
            "'advisory' logs but permits."
        ),
    )

    # ---------- auth ----------
    api_key_hash: Optional[str] = Field(
        default=None,
        description="SHA-256 hash of the bearer API key (hex-encoded).",
    )
    admin_key: Optional[str] = Field(
        default=None,
        description="Admin key for privileged operations (hashed at rest).",
    )

    # ---------- retention ----------
    retention_days: int = Field(
        default=30,
        description="Number of days to retain audit logs.",
    )

    # ---------- approval queue ----------
    enable_approval_queue: bool = Field(
        default=True,
        description="Whether high-risk actions require human approval.",
    )
    approval_timeout_minutes: int = Field(
        default=30,
        description="Minutes before a pending approval auto-denies.",
    )
    approval_notify_url: Optional[str] = Field(
        default=None,
        description="Webhook URL for approval status notifications (POST).",
    )
    approval_sweeper_interval_seconds: int = Field(
        default=300,
        description="Seconds between approval sweeper runs.",
    )
