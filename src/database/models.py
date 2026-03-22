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
    String, Text, Boolean, DateTime, Float, Index, ForeignKey,
    CheckConstraint, UniqueConstraint, Uuid, JSON, Integer,
)
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
    tier: Mapped[str] = mapped_column(String(50), nullable=False, default="free")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    # MSSP hierarchy -- null means this is a root/standalone tenant
    parent_tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("_soul_tenants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Cached depth in hierarchy (0 = root, 1 = direct child, 2 = grandchild, 3 = max)
    hierarchy_depth: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Depth in MSSP hierarchy. Max=3 enforced at application layer.",
    )
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSON, default=dict, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=True)

    __table_args__ = (
        Index("idx_soul_tenants_parent", "parent_tenant_id"),
        CheckConstraint("hierarchy_depth >= 0 AND hierarchy_depth <= 3", name="ck_soul_tenants_max_depth"),
    )


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
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSON, default=dict, nullable=True)

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
    # prev_hash: SHA-256 of the previous row's chain data (migration 0004).
    # NULL only for rows written before migration 0004 was applied.
    # The first row in a fresh deployment stores the sentinel value "genesis".
    prev_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        Index("idx_audit_tenant_time", "tenant_id", "timestamp"),
        Index("idx_audit_soulkey", "soulkey_id", "timestamp"),
        Index("idx_audit_event", "event_type"),
        Index("idx_audit_prev_hash_lookup", "timestamp"),
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
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSON, default=dict, nullable=True)

    __table_args__ = (
        Index("idx_trials_email", "contact_email"),
        Index("idx_trials_domain", "company_domain"),
    )
# SSO/OIDC ORM models to append to src/database/models.py


class SoulUser(Base):
    """_soul_users — Human portal users (distinct from SoulKey agent identities)."""
    __tablename__ = "_soul_users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id"), nullable=False
    )
    email: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    admin_role: Mapped[str] = mapped_column(Text, nullable=False, default="viewer")
    idp_sub: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    idp_provider: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=True
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=True
    )
    metadata_: Mapped[Optional[dict]] = mapped_column(
        "metadata_", JSON, default=dict, nullable=True
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_soul_users_tenant_email"),
        UniqueConstraint(
            "tenant_id", "idp_provider", "idp_sub",
            name="uq_soul_users_tenant_idp_sub",
        ),
        Index("idx_soul_users_tenant", "tenant_id"),
        Index("idx_soul_users_email", "email"),
    )


class SoulIdPConfig(Base):
    """_soul_idp_configs — Per-tenant Identity Provider configuration."""
    __tablename__ = "_soul_idp_configs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id"), nullable=False
    )
    provider_type: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    client_id: Mapped[str] = mapped_column(Text, nullable=False)
    client_secret_enc: Mapped[str] = mapped_column(Text, nullable=False)
    discovery_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    issuer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Stored as JSON list for cross-DB compatibility (PostgreSQL uses ARRAY in migration)
    scopes: Mapped[Optional[list]] = mapped_column(
        JSON, default=lambda: ["openid", "email", "profile"], nullable=True
    )
    claim_mapping: Mapped[Optional[dict]] = mapped_column(
        JSON, default=lambda: {"email": "email", "name": "name"}, nullable=True
    )
    domain_hint: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    group_role_map: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=True
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=True
    )

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "provider_type",
            name="uq_soul_idp_configs_tenant_provider",
        ),
        Index("idx_soul_idp_configs_tenant", "tenant_id"),
        Index("idx_soul_idp_configs_domain_hint", "domain_hint"),
    )


class SoulOIDCSession(Base):
    """_soul_oidc_sessions — Short-lived portal sessions for human users."""
    __tablename__ = "_soul_oidc_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_users.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id"), nullable=False
    )
    session_token: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    refresh_token_enc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    issued_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_active: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=True
    )
    ip_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("session_token", name="uq_soul_oidc_sessions_token"),
        Index("idx_soul_oidc_sessions_token", "session_token"),
        Index("idx_soul_oidc_sessions_user_expires", "user_id", "expires_at"),
    )
