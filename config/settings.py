"""
SoulAuth Configuration Management
Environment-based settings with sensible defaults.
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "SoulAuth"
    app_version: str = "1.0.0"
    debug: bool = False
    log_level: str = "INFO"

    # Mode: "enterprise" (default, Postgres) or "local" (SQLite, zero-config)
    mode: str = Field(
        default="enterprise",
        description="Operating mode: 'local' (SQLite, zero-config) or 'enterprise' (Postgres)",
    )

    # Local mode settings
    local_db_path: Optional[str] = Field(
        default=None,
        description="Override default ~/.soulauth/soulauth.db path for local mode",
    )

    # Database (Supabase/PostgreSQL)
    # No default — must be explicitly configured. Validated at startup for enterprise mode.
    database_url: Optional[str] = Field(
        default=None,
        description="Async database connection URL (required for enterprise mode)",
    )
    database_url_sync: Optional[str] = Field(
        default=None,
        description="Sync database connection URL for Alembic (required for enterprise mode)",
    )
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30

    # JWT / Capability Tokens
    jwt_algorithm: str = "ES256"
    jwt_private_key_path: Optional[str] = None
    jwt_public_key_path: Optional[str] = None
    jwt_private_key: Optional[str] = None
    jwt_public_key: Optional[str] = None
    default_token_ttl: int = 300
    max_token_ttl: int = 900

    # JWT Key Rotation (FINDING-17)
    # kid (Key ID) identifies which signing key version issued a token.
    # Rotation procedure:
    #   1. Generate new key pair, assign new kid (e.g. "soulauth-2026-04")
    #   2. Set SOULAUTH_JWT_KID to the new kid value
    #   3. Deploy with both old and new public keys available for verification
    #   4. After max_token_ttl seconds, old tokens expire; remove old public key
    jwt_kid: Optional[str] = Field(
        default=None,
        description="Key ID (kid) for JWT header — identifies the signing key version for rotation",
    )

    # Soulkey
    soulkey_hash_algorithm: str = "sha512"

    # Policy
    policy_repo_path: Optional[str] = None
    policy_cache_ttl: int = 300

    # Server
    host: str = "0.0.0.0"
    port: int = Field(default=8000, validation_alias="SOULAUTH_SERVER_PORT")

    # Supabase
    supabase_url: Optional[str] = None
    supabase_service_key: Optional[str] = None

    # Telegram
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None

    # Notifications / Enterprise Alerting
    notifications_enabled: bool = False
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

    # Resend (transactional email for trial verification)
    resend_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = Field(
        default=None,
        description="OpenRouter API key for chatbot LLM (OPENROUTER_API_KEY env var)",
    )
    trial_from_email: str = "Tiresias <onboarding@resend.dev>"
    trial_verify_base_url: str = "https://tiresias.network/trial/verify"

    # Detection Engine (Sigma rules + playbooks)
    detection_enabled: bool = True
    detection_rules_dir: Optional[str] = Field(
        default=None,
        description="Path to directory containing Sigma rule YAML files",
    )
    detection_playbooks_dir: Optional[str] = Field(
        default=None,
        description="Path to directory containing response playbook YAML files",
    )

    # License Enforcement
    license_key: str = Field(
        default="",
        description="Tiresias license JWT. Set via TIRESIAS_LICENSE_KEY env var.",
    )
    license_grace_hours: float = Field(
        default=72.0,
        description="Hours to allow degraded operation after license expiry",
    )
    license_required: bool = Field(
        default=True,
        description="If True, missing/invalid license causes SystemExit(2)",
    )

    # Tier Override (v2.1 Enterprise Tier System)
    tiresias_tier: str = Field(
        default="",
        description=(
            "Override the license tier at deploy time for SKU selection. "
            "Valid values: community, starter, pro, enterprise, mssp, saas. "
            "Empty string = use license JWT tier."
        ),
        validation_alias="TIRESIAS_TIER",
    )

    # SIEM Integration
    siem_enabled: bool = False
    siem_buffer_size: int = 100
    siem_flush_interval: int = 30
    siem_destinations: Optional[str] = Field(
        default=None,
        description=(
            "JSON-encoded list of SIEM destination configs. "
            "Each item must include a 'type' field: splunk, elastic, syslog, webhook, azure_sentinel. "
            "Example: '[{\"type\":\"webhook\",\"url\":\"https://example.com/hook\"}]'"
        ),
    )

    # Authentication mode
    auth_mode: str = Field(
        default="oidc",
        description="Authentication mode: oidc, local, ldap, or comma-separated for multi-mode (e.g., local,ldap)",
    )

    # Local auth bootstrap
    local_admin_email: Optional[str] = Field(
        default=None,
        description="Bootstrap admin email for local auth mode (first run only)",
    )
    local_admin_password: Optional[str] = Field(
        default=None,
        description="Bootstrap admin password for local auth mode (first run only, hashed on creation)",
    )

    # Login rate limiting
    login_max_attempts: int = Field(
        default=5,
        description="Maximum failed login attempts before lockout",
    )
    login_lockout_minutes: int = Field(
        default=15,
        description="Minutes to lock account after max failed attempts",
    )

    # LDAP settings (for Phase 3)
    ldap_url: Optional[str] = Field(
        default=None,
        description="LDAP server URL (e.g., ldap://saluca.local:389 or ldaps://saluca.local:636)",
    )
    ldap_bind_dn: Optional[str] = Field(
        default=None,
        description="Service account DN for LDAP bind (e.g., CN=soulauth-bind,OU=Service-Accounts,DC=saluca,DC=local)",
    )
    ldap_bind_password: Optional[str] = Field(
        default=None,
        description="Service account password for LDAP bind",
    )
    ldap_search_base: Optional[str] = Field(
        default=None,
        description="LDAP search base DN (e.g., DC=saluca,DC=local)",
    )
    ldap_user_filter: str = Field(
        default="(sAMAccountName={username})",
        description="LDAP user search filter template",
    )
    ldap_group_attribute: str = Field(
        default="memberOf",
        description="LDAP attribute containing group memberships",
    )
    ldap_group_role_map: Optional[str] = Field(
        default=None,
        description="JSON mapping of LDAP group DNs to SoulAuth roles",
    )

    # Contact emails (shown to customers — override via env vars)
    support_email: str = Field(
        default="support@tiresias.network",
        description="Support contact email shown to customers",
    )
    billing_email: str = Field(
        default="billing@tiresias.network",
        description="Billing contact email shown to customers",
    )
    contact_email: str = Field(
        default="contact@tiresias.network",
        description="General contact email shown to customers",
    )

    # OIDC / SSO Settings
    oidc_secret_key: Optional[str] = Field(
        default=None,
        description="Fernet key for client_secret encryption in IdP configs",
    )
    oidc_state_secret: Optional[str] = Field(
        default=None,
        description="HMAC secret for PKCE state parameter signing",
    )
    oidc_session_ttl: int = Field(
        default=28800,
        description="OIDC portal session TTL in seconds (default: 8 hours)",
    )
    oidc_jwks_cache_ttl: int = Field(
        default=3600,
        description="JWKS cache TTL in seconds (default: 1 hour)",
    )
    public_url: str = Field(
        default="https://tiresias.network",
        description="Public base URL for OAuth redirect_uri construction",
    )
    allowed_origins: list[str] = Field(
        default=["https://tiresias.network"],
        description="Allowlist of portal origins for OIDC redirect_uri",
    )
    oidc_enabled: bool = Field(
        default=False,
        description="Feature flag: enable SSO/OIDC portal authentication",
    )

    model_config = {
        "env_prefix": "SOULAUTH_",
        "env_file": ".env",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()

    # Validate database URL is set for enterprise mode (FINDING-10)
    if settings.mode == "enterprise":
        if not settings.database_url:
            raise ValueError(
                "SOULAUTH_DATABASE_URL must be set in enterprise mode. "
                "Set the environment variable or use SOULAUTH_MODE=local for zero-config SQLite."
            )
        if not settings.database_url_sync:
            raise ValueError(
                "SOULAUTH_DATABASE_URL_SYNC must be set in enterprise mode. "
                "Set the environment variable or use SOULAUTH_MODE=local for zero-config SQLite."
            )

    # Auto-configure local mode settings
    if settings.mode == "local":
        from pathlib import Path

        home = Path.home() / ".soulauth"
        db_path = settings.local_db_path or str(home / "soulauth.db")

        # Override database URL to SQLite
        settings.database_url = f"sqlite+aiosqlite:///{db_path}"
        settings.database_url_sync = f"sqlite:///{db_path}"

        # Point JWT keys to local key files
        keys_dir = home / "keys"
        if settings.jwt_private_key_path is None:
            settings.jwt_private_key_path = str(keys_dir / "private.pem")
        if settings.jwt_public_key_path is None:
            settings.jwt_public_key_path = str(keys_dir / "public.pem")

        # Disable enterprise features by default in local mode
        settings.detection_enabled = False
        settings.siem_enabled = False
        settings.notifications_enabled = False

        # Bind to localhost only in local mode
        settings.host = "127.0.0.1"

    return settings
