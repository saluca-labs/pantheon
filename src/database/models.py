"""
SQLAlchemy ORM models for SoulAuth database tables.
Mirrors the schema defined in SPEC.md sections 3.2, 4.5, 7.1, 8.3, 16.3.
Uses generic types (Uuid, JSON) for cross-database compatibility in testing.
PostgreSQL-specific features (JSONB, partial indexes) are in database/schema.sql.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    String, Text, Boolean, DateTime, Float, Integer, Index, ForeignKey,
    CheckConstraint, UniqueConstraint, Uuid, JSON, LargeBinary,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from src.database.connection import Base


def _uuid_default():
    return uuid.uuid4()


def _now():
    return datetime.now(timezone.utc)


class SoulTenant(Base):
    __tablename__ = "_soul_tenants"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(63), nullable=False, unique=True)
    tier: Mapped[str] = mapped_column(String(50), nullable=False, default="community")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True, index=True)
    parent_tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id", ondelete="SET NULL"), nullable=True
    )
    hierarchy_depth: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata_", JSON, default=dict, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=True)


class Soulkey(Base):
    """_soulkeys - Durable agent identity credentials."""
    __tablename__ = "_soulkeys"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("_soul_tenants.id"), nullable=False)
    persona_id: Mapped[str] = mapped_column(Text, nullable=False)
    key_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    label: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    issued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    revocation_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata_", JSON, default=dict, nullable=True)

    __table_args__ = (
        Index("idx_soulkeys_hash", "key_hash"),
        Index("idx_soulkeys_tenant_persona", "tenant_id", "persona_id"),
    )


class PolicyCache(Base):
    """_soulauth_policy_cache - Resolved policies synced from git."""
    __tablename__ = "_soulauth_policy_cache"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("_soul_tenants.id"), nullable=False)
    persona_id: Mapped[str] = mapped_column(Text, nullable=False)
    policy_version: Mapped[str] = mapped_column(Text, nullable=False)
    resolved_policy: Mapped[dict] = mapped_column(JSON, nullable=False)
    synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "persona_id", name="uq_policy_cache_tenant_persona"),
    )


class AuditLog(Base):
    """_soulauth_audit - Immutable audit trail for all auth events."""
    __tablename__ = "_soulauth_audit"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    soulkey_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    persona_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resource: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    action: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scope: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decision: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    capability_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    context: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    prev_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, comment="SHA-256 hex of previous audit row in chain. NULL for pre-0004 rows. Genesis sentinel is literal string genesis.")
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        Index("idx_audit_tenant_time", "tenant_id", "timestamp"),
        Index("idx_audit_soulkey", "soulkey_id", "timestamp"),
        Index("idx_audit_event", "event_type"),
    )


class Delegation(Base):
    """_soulauth_delegations - Temporary scope expansions."""
    __tablename__ = "_soulauth_delegations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    grantor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("_soulkeys.id"), nullable=False)
    grantee_persona: Mapped[str] = mapped_column(Text, nullable=False)
    resource: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    scope: Mapped[str] = mapped_column(Text, nullable=False)
    granted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class QuarantinePolicyDB(Base):
    """_soulauth_quarantine_policies - Per-tenant configurable quarantine policies."""
    __tablename__ = "_soulauth_quarantine_policies"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("_soul_tenants.id"), nullable=False)
    trigger_type: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="Anomaly type that triggers this policy: anomaly_score, credential_stuffing, scope_escalation, rate_spike, or 'any'",
    )
    threshold: Mapped[float] = mapped_column(nullable=False, default=0.8)
    severity_threshold: Mapped[str] = mapped_column(
        String(50), nullable=False, default="high",
        comment="Minimum anomaly severity to trigger: low, medium, high, critical",
    )
    action: Mapped[str] = mapped_column(
        String(100), nullable=False, default="suspend_key",
        comment="Comma-separated quarantine actions: suspend_key, revoke_key, kill_session, force_reauth, rate_limit, isolate, reset_context",
    )
    cooldown_minutes: Mapped[int] = mapped_column(nullable=False, default=15)
    auto_release_hours: Mapped[Optional[float]] = mapped_column(nullable=True, default=1.0)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=True)

    __table_args__ = (
        Index("idx_quarantine_policies_tenant", "tenant_id"),
    )


class RevokedToken(Base):
    """_soulauth_revoked_tokens - DB-backed token revocation list."""
    __tablename__ = "_soulauth_revoked_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    jti: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    revoked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("idx_revoked_tokens_jti", "jti"),
    )


class Trial(Base):
    """_soulauth_trials - Self-service trial provisioning."""
    __tablename__ = "_soulauth_trials"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("_soul_tenants.id"), nullable=True)
    contact_name: Mapped[str] = mapped_column(Text, nullable=False)
    contact_email: Mapped[str] = mapped_column(Text, nullable=False)
    company_name: Mapped[str] = mapped_column(Text, nullable=False)
    company_domain: Mapped[str] = mapped_column(Text, nullable=False)
    use_case: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    soulkey_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("_soulkeys.id"), nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    activated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    converted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata_", JSON, default=dict, nullable=True)

    __table_args__ = (
        Index("idx_trials_email", "contact_email"),
        Index("idx_trials_domain", "company_domain"),
    )


class Waitlist(Base):
    """_soulauth_waitlist - Waitlist email collection."""
    __tablename__ = "_soulauth_waitlist"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    contact_name: Mapped[str] = mapped_column(Text, nullable=False)
    contact_email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    company_name: Mapped[str] = mapped_column(Text, nullable=False)
    company_domain: Mapped[str] = mapped_column(Text, nullable=False)
    use_case: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    invited_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata_", JSON, default=dict, nullable=True)

    __table_args__ = (
        Index("idx_waitlist_email", "contact_email"),
        Index("idx_waitlist_domain", "company_domain"),
    )


class SoulUser(Base):
    """_soul_users - Authenticated human users provisioned via OIDC/SSO JIT flow.

    Users are created on first login through an IdP (Google, Okta, Azure AD, generic OIDC).
    Each user belongs to exactly one tenant and holds an admin_role for portal access control.
    The idp_sub + idp_provider pair uniquely identifies the user within a tenant.
    """
    __tablename__ = "_soul_users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("_soul_tenants.id"), nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    admin_role: Mapped[str] = mapped_column(Text, nullable=False, default="viewer")
    idp_sub: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    idp_provider: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(Text, nullable=True, doc="bcrypt hash for local auth (null for OIDC/LDAP users)")
    auth_provider: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="oidc", doc="Authentication method: oidc, local, ldap")
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=True)
    is_account_admin: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Tenant-wide account admin; can manage all users/teams/billing"
    )
    is_secondary_admin: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Secondary admin; full user/team management but cannot remove primary admin"
    )
    primary_team_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("_soul_teams.id", ondelete="SET NULL"), nullable=True,
        comment="User's primary/default team for scoping dashboards"
    )
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata_", JSON, default=dict, nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_soul_users_tenant_email"),
        UniqueConstraint("tenant_id", "idp_provider", "idp_sub", name="uq_soul_users_tenant_idp_sub"),
        CheckConstraint("admin_role IN ('owner', 'admin', 'operator', 'viewer')", name="ck_soul_users_admin_role"),
        CheckConstraint("status IN ('active', 'suspended', 'deactivated')", name="ck_soul_users_status"),
        Index("idx_soul_users_tenant", "tenant_id"),
        Index("idx_soul_users_email", "email"),
    )


class SoulIdPConfig(Base):
    """_soul_idp_configs - OIDC Identity Provider configurations per tenant.

    Each tenant can have one IdP config per provider_type (google, okta, azure_ad, oidc).
    The client_secret_enc field stores the encrypted client secret (AES-256-GCM via IdP encryption module).
    The group_role_map enables automatic admin_role assignment based on IdP group claims.
    """
    __tablename__ = "_soul_idp_configs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("_soul_tenants.id"), nullable=False)
    provider_type: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_default: Mapped[Optional[bool]] = mapped_column(Boolean, default=False, nullable=True)
    client_id: Mapped[str] = mapped_column(Text, nullable=False)
    client_secret_enc: Mapped[str] = mapped_column(Text, nullable=False)
    discovery_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    issuer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scopes: Mapped[Optional[list]] = mapped_column(ARRAY(Text), nullable=True)
    claim_mapping: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)
    domain_hint: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    group_role_map: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "provider_type", name="uq_soul_idp_configs_tenant_provider"),
        CheckConstraint("provider_type IN ('google', 'okta', 'azure_ad', 'oidc')", name="ck_soul_idp_provider_type"),
        CheckConstraint("status IN ('active', 'disabled')", name="ck_soul_idp_status"),
        Index("idx_soul_idp_configs_tenant", "tenant_id"),
        Index("idx_soul_idp_configs_domain_hint", "domain_hint"),
    )


class SoulOIDCSession(Base):
    """_soul_oidc_sessions - Active OIDC login sessions for portal users.

    Sessions are created after successful OIDC callback and token exchange.
    The session_token is stored as a SHA-256 hash; the raw token is returned to the client
    once and set as an HttpOnly cookie. Sessions are validated by hashing the presented token
    and looking up the hash. Revocation sets revoked_at; expired sessions are filtered by expires_at.
    """
    __tablename__ = "_soul_oidc_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("_soul_users.id", ondelete="CASCADE"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("_soul_tenants.id"), nullable=False)
    session_token: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    refresh_token_enc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    issued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_active: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("session_token", name="uq_soul_oidc_sessions_token"),
        Index("idx_soul_oidc_sessions_token", "session_token"),
        Index("idx_soul_oidc_sessions_user_expires", "user_id", "expires_at"),
    )


class SoulLicense(Base):
    """_soul_licenses - Persistent license records for tier enforcement."""
    __tablename__ = "_soul_licenses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=True
    )
    license_key_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    tier: Mapped[str] = mapped_column(String(50), nullable=False)
    features: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    is_nfr: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    partner_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    grace_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)
    jwt_claims: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    issued_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        Index("idx_soul_licenses_tenant", "tenant_id"),
        Index("idx_soul_licenses_status", "status"),
    )


class SoulPartner(Base):
    """_soul_partners - Channel partner/reseller records."""
    __tablename__ = "_soul_partners"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)
    stripe_connect_account_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)
    stripe_connect_status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)
    commission_rate: Mapped[float] = mapped_column(Float, default=0.40, nullable=False)
    referral_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    parent_partner_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("_soul_partners.id", ondelete="SET NULL"), nullable=True
    )
    override_commission_rate: Mapped[float] = mapped_column(Float, default=0.10, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)
    contract_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata_", JSON, default=dict, nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        Index("idx_soul_partners_referral_code", "referral_code"),
        Index("idx_soul_partners_status", "status"),
        Index("idx_soul_partners_parent", "parent_partner_id"),
    )


class SIEMConnector(Base):
    """_siem_connectors - Persistent SIEM connector configuration per tenant."""
    __tablename__ = "_siem_connectors"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # syslog | webhook
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    filter_severity: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    filter_event_kind: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        Index("idx_siem_connectors_tenant", "tenant_id"),
        Index("idx_siem_connectors_kind", "kind"),
    )


class NotificationChannel(Base):
    """_notification_channels - Per-tenant alert delivery channel config."""
    __tablename__ = "_notification_channels"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    channel_type: Mapped[str] = mapped_column(String(30), nullable=False)
    config_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    severity_threshold: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    test_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    last_tested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        Index("idx_notification_channels_tenant", "tenant_id"),
        Index("idx_notification_channels_type", "channel_type"),
    )


class SoulTeam(Base):
    """_soul_teams - Logical team/group within a tenant."""
    __tablename__ = "_soul_teams"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(63), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False,
        comment="Exactly one default team per tenant; new users land here")
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("_soul_users.id", ondelete="SET NULL"), nullable=True
    )
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata_", JSON, default=dict, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "slug", name="uq_soul_teams_tenant_slug"),
        Index("idx_soul_teams_tenant", "tenant_id"),
    )


class SoulTeamMember(Base):
    """_soul_team_members - User membership in a team with team-scoped role."""
    __tablename__ = "_soul_team_members"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_teams.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_users.id", ondelete="CASCADE"), nullable=False
    )
    team_role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="member",
        comment="Team-scoped role: team_admin, analyst, member"
    )
    joined_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    added_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("_soul_users.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_soul_team_members_team_user"),
        CheckConstraint("team_role IN ('team_admin', 'analyst', 'member')", name="ck_soul_team_members_role"),
        Index("idx_soul_team_members_team", "team_id"),
        Index("idx_soul_team_members_user", "user_id"),
    )


class SoulUserInvite(Base):
    """_soul_user_invites - Pending invitations to join a tenant/team."""
    __tablename__ = "_soul_user_invites"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("_soul_teams.id", ondelete="SET NULL"), nullable=True,
        comment="Target team; NULL = default team"
    )
    email: Mapped[str] = mapped_column(Text, nullable=False)
    invited_role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="viewer",
        comment="Portal-level admin_role to assign on acceptance"
    )
    invited_team_role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="member",
        comment="Team-level role to assign on acceptance"
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True,
        comment="SHA-256 hash of the invite token sent via email"
    )
    invited_by: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending",
        comment="pending | accepted | expired | revoked"
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("_soul_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'accepted', 'expired', 'revoked')", name="ck_soul_user_invites_status"),
        Index("idx_soul_user_invites_tenant", "tenant_id"),
        Index("idx_soul_user_invites_email", "email"),
        Index("idx_soul_user_invites_token", "token_hash"),
    )


class PolicyHistory(Base):
    """_soulauth_policy_history - Version history and rollback snapshots for policies."""
    __tablename__ = "_soulauth_policy_history"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False
    )
    persona_id: Mapped[str] = mapped_column(Text, nullable=False)
    policy_version: Mapped[str] = mapped_column(Text, nullable=False)
    resolved_policy: Mapped[dict] = mapped_column(JSON, nullable=False,
        comment="Full policy snapshot at this version")
    changed_by: Mapped[str] = mapped_column(String(100), nullable=False,
        comment="Who made the change: portal, git_sync, api, portal_rollback")
    change_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True,
        comment="Human-readable description of what changed")
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        Index("idx_policy_history_tenant_persona_time", "tenant_id", "persona_id", "created_at"),
    )


class PolicyDeployKey(Base):
    """_policy_deploy_keys - Per-tenant SSH deploy keys for policy git push."""
    __tablename__ = "_policy_deploy_keys"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False
    )
    key_name: Mapped[str] = mapped_column(String(255), nullable=False,
        comment="Human label, e.g. 'policy-sync-minipc'")
    public_key: Mapped[str] = mapped_column(Text, nullable=False,
        comment="SSH public key content")
    private_key_encrypted: Mapped[Optional[bytes]] = mapped_column(
        LargeBinary, nullable=True,
        comment="AES-256-GCM encrypted private key for cloud-managed keys"
    )
    fingerprint: Mapped[str] = mapped_column(String(255), nullable=False,
        comment="SSH key fingerprint (SHA256:...) for identification")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "key_name", name="uq_policy_deploy_keys_tenant_key_name"),
        CheckConstraint("status IN ('active', 'revoked')", name="ck_policy_deploy_keys_status"),
        Index("idx_policy_deploy_keys_tenant", "tenant_id"),
        Index("idx_policy_deploy_keys_fingerprint", "fingerprint"),
    )


# ---------------------------------------------------------------------------
# Tier and RBAC Configuration Overrides
# Privacy: Database-backed config allows runtime updates without redeploy.
# Compliance: All changes audit-logged via updated_at timestamps.
# ---------------------------------------------------------------------------

class TierOverride(Base):
    """tier_overrides - Runtime tier configuration overrides."""
    __tablename__ = "tier_overrides"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tier_name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    max_children: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=None)
    allowed_children_json: Mapped[Optional[list]] = mapped_column("allowed_children", JSON, nullable=True, default=list)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=True)


class RolePermission(Base):
    """role_permissions - Runtime RBAC permission overrides."""
    __tablename__ = "role_permissions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    role_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    permission: Mapped[str] = mapped_column(String(100), nullable=False)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=True
    )
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=True)

    __table_args__ = (
        UniqueConstraint('role_name', 'permission', 'tenant_id', name='uq_role_permission_tenant'),
        Index('idx_role_permissions_tenant', 'tenant_id', 'role_name'),
    )
