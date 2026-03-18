"""
SQLAlchemy ORM models for SoulGate database tables.
All tables prefixed with _soulgate_.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    String, Text, Boolean, DateTime, Float, Integer,
    Index, Uuid, JSON,
)
from sqlalchemy.orm import Mapped, mapped_column

from soulGate.src.database.connection import Base


def _uuid_default():
    return uuid.uuid4()


def _now():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# SoulGate-specific tables
# ---------------------------------------------------------------------------


class SoulGateAPIKey(Base):
    """API key records with hashed keys, scopes, and rotation tracking."""
    __tablename__ = "_soulgate_api_keys"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    key_hash: Mapped[str] = mapped_column(Text, nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(12), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="active",
    )  # active, revoked, expired
    scopes: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=list)
    rate_limit_override: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    rotated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_soulgate_api_keys_tenant", "tenant_id"),
        Index("idx_soulgate_api_keys_prefix", "key_prefix"),
        Index("idx_soulgate_api_keys_status", "status"),
    )


class SoulGateRateLimit(Base):
    """Rate limit policies per tenant/soulkey/persona/endpoint."""
    __tablename__ = "_soulgate_rate_limits"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    soulkey_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    persona_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    endpoint_pattern: Mapped[str] = mapped_column(String(500), nullable=False, default="*")
    requests_per_minute: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    burst_size: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    window_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="sliding",
    )  # sliding, fixed
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=True)

    __table_args__ = (
        Index("idx_soulgate_rate_limits_tenant", "tenant_id"),
        Index("idx_soulgate_rate_limits_soulkey", "soulkey_id"),
        Index("idx_soulgate_rate_limits_enabled", "enabled"),
    )


class SoulGateAccessRule(Base):
    """IP and geo access rules (allow/deny lists)."""
    __tablename__ = "_soulgate_access_rules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    rule_type: Mapped[str] = mapped_column(
        String(30), nullable=False,
    )  # ip_allow, ip_deny, geo_allow, geo_deny
    value: Mapped[str] = mapped_column(String(500), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        Index("idx_soulgate_access_rules_tenant", "tenant_id"),
        Index("idx_soulgate_access_rules_type", "rule_type"),
        Index("idx_soulgate_access_rules_enabled", "enabled"),
    )


class SoulGateUpstream(Base):
    """Upstream service registry for reverse proxy routing."""
    __tablename__ = "_soulgate_upstreams"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    health_endpoint: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, default="/health")
    timeout_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=30000)
    retries: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    strip_prefix: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    circuit_breaker_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="active",
    )  # active, draining, disabled
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=True)

    __table_args__ = (
        Index("idx_soulgate_upstreams_tenant", "tenant_id"),
        Index("idx_soulgate_upstreams_name", "name"),
        Index("idx_soulgate_upstreams_status", "status"),
    )


class SoulGateRequestLog(Base):
    """Audit log for every request processed through the gateway."""
    __tablename__ = "_soulgate_request_log"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    soulkey_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    persona_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    api_key_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    path: Mapped[str] = mapped_column(Text, nullable=False)
    request_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    response_status: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    response_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    response_time_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    upstream_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    block_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    threat_flags: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    source_ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        Index("idx_soulgate_request_log_tenant", "tenant_id"),
        Index("idx_soulgate_request_log_soulkey", "soulkey_id"),
        Index("idx_soulgate_request_log_created", "created_at"),
        Index("idx_soulgate_request_log_upstream", "upstream_name"),
        Index("idx_soulgate_request_log_blocked", "blocked"),
    )


class SoulGateCircuitState(Base):
    """Persistent circuit breaker state per upstream."""
    __tablename__ = "_soulgate_circuit_states"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    upstream_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, unique=True)
    state: Mapped[str] = mapped_column(
        String(20), nullable=False, default="closed",
    )  # closed, open, half_open
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_failure_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    opened_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=True)

    __table_args__ = (
        Index("idx_soulgate_circuit_states_upstream", "upstream_id"),
        Index("idx_soulgate_circuit_states_state", "state"),
    )


class SoulGateThreatPattern(Base):
    """Custom threat detection patterns (regex or keyword)."""
    __tablename__ = "_soulgate_threat_patterns"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    pattern_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="regex",
    )  # regex, keyword
    pattern: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(
        String(20), nullable=False, default="medium",
    )  # low, medium, high, critical
    action: Mapped[str] = mapped_column(
        String(20), nullable=False, default="block",
    )  # block, flag, sanitize
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        Index("idx_soulgate_threat_patterns_tenant", "tenant_id"),
        Index("idx_soulgate_threat_patterns_enabled", "enabled"),
        Index("idx_soulgate_threat_patterns_type", "pattern_type"),
    )
