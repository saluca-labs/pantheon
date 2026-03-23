"""
SQLAlchemy ORM models for SoulWatch database tables.
All tables prefixed with _soulwatch_.
Also imports shared SoulAuth models (read-only) for joining.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    String, Text, Boolean, DateTime, Float, Integer,
    Index, ForeignKey, Uuid, JSON, LargeBinary,
)
from sqlalchemy.orm import Mapped, mapped_column

from soulWatch.src.database.connection import Base


def _uuid_default():
    return uuid.uuid4()


def _now():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# SoulWatch-specific tables
# ---------------------------------------------------------------------------


class SoulWatchBaseline(Base):
    """Persisted behavioral baselines per agent."""
    __tablename__ = "_soulwatch_baselines"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    soulkey_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, unique=True)
    typical_request_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    typical_resources: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=list)
    typical_actions: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=list)
    typical_scopes: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=list)
    typical_hours: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=list)
    typical_denial_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    typical_burst_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    events_analyzed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lookback_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=168)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=True)

    __table_args__ = (
        Index("idx_soulwatch_baselines_soulkey", "soulkey_id"),
    )


class SoulWatchAnomaly(Base):
    """Detected anomalies with status tracking."""
    __tablename__ = "_soulwatch_anomalies"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    soulkey_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    anomaly_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    baseline_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    observed_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="open",
    )  # open, acknowledged, resolved, false_positive
    acknowledged_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    source_event_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        Index("idx_soulwatch_anomalies_soulkey", "soulkey_id"),
        Index("idx_soulwatch_anomalies_type", "anomaly_type"),
        Index("idx_soulwatch_anomalies_severity", "severity"),
        Index("idx_soulwatch_anomalies_status", "status"),
        Index("idx_soulwatch_anomalies_created", "created_at"),
        Index("idx_soulwatch_anomalies_tenant", "tenant_id"),
    )


class SoulWatchDetection(Base):
    """Sigma rule match log."""
    __tablename__ = "_soulwatch_detections"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    rule_id: Mapped[str] = mapped_column(String(255), nullable=False)
    rule_title: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[str] = mapped_column(String(30), nullable=False)
    soulkey_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    matched_fields: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    event_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    response_playbook: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)

    __table_args__ = (
        Index("idx_soulwatch_detections_rule", "rule_id"),
        Index("idx_soulwatch_detections_level", "level"),
        Index("idx_soulwatch_detections_created", "created_at"),
        Index("idx_soulwatch_detections_soulkey", "soulkey_id"),
    )


class SoulWatchQuarantine(Base):
    """Quarantine records with release workflow."""
    __tablename__ = "_soulwatch_quarantines"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    soulkey_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    persona_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    triggered_by_type: Mapped[str] = mapped_column(String(50), nullable=False)
    triggered_by_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    actions_taken: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=list)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="active",
    )  # active, released, expired, pending_approval
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    quarantined_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    released_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    auto_release_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    released_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_soulwatch_quarantines_soulkey", "soulkey_id"),
        Index("idx_soulwatch_quarantines_status", "status"),
        Index("idx_soulwatch_quarantines_tenant", "tenant_id"),
    )


class SoulWatchDLQ(Base):
    """Dead letter queue for failed SIEM forwarding."""
    __tablename__ = "_soulwatch_dlq"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    event_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    destination: Mapped[str] = mapped_column(String(100), nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    last_retry_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_soulwatch_dlq_destination", "destination"),
        Index("idx_soulwatch_dlq_created", "created_at"),
    )


class SoulWatchCustomRule(Base):
    """Per-tenant custom Sigma rules."""
    __tablename__ = "_soulwatch_custom_rules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    rule_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    yaml_content: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[str] = mapped_column(String(30), nullable=False, default="medium")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=True)

    __table_args__ = (
        Index("idx_soulwatch_custom_rules_tenant", "tenant_id"),
        Index("idx_soulwatch_custom_rules_rule_id", "rule_id"),
    )


class AletheiaToolInvocation(Base):
    """Aletheia tool invocation telemetry from tiresias-exec."""
    __tablename__ = "aletheia_tool_invocations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    invocation_id: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    agent_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    command: Mapped[str] = mapped_column(String(500), nullable=False)
    args: Mapped[dict] = mapped_column(JSON, nullable=False, default=list)
    full_command: Mapped[str] = mapped_column(Text, nullable=False)
    working_directory: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    exit_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stdout_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stderr_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stdout_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    stderr_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    policy_verdict: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    policy_rule_matched: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sanitizer_mode: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sanitizer_verdict: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    patterns_matched: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=list)
    environment_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)

    __table_args__ = (
        Index("idx_tool_inv_tenant_time", "tenant_id", "timestamp"),
        Index("idx_tool_inv_agent", "tenant_id", "agent_id"),
        Index("idx_tool_inv_command", "tenant_id", "command"),
    )


class AletheiaBlockedOutput(Base):
    """Forensic storage of blocked tool outputs (encrypted with AES-256-GCM).

    Encryption key management:
      - Master key: ALETHEIA_MASTER_KEY env var (base64-encoded 256-bit key).
        Set via Cloud Run secrets or Vault injection at deploy time.
      - Per-tenant DEK: derived from master key + tenant_id using HKDF-SHA256
        (see src.aletheia.encryption.derive_tenant_dek).
      - Rotation: deploy a new ALETHEIA_MASTER_KEY and re-encrypt existing
        rows via the aletheia key-rotation management command. Old rows
        remain readable until purged (nonce+tag stored per-row).
    """
    __tablename__ = "aletheia_blocked_outputs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    invocation_id: Mapped[str] = mapped_column(String(100), nullable=False)
    agent_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    command: Mapped[str] = mapped_column(String(500), nullable=False)
    encrypted_output: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    output_nonce: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    output_tag: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    output_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    patterns_matched: Mapped[dict] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("idx_blocked_output_tenant", "tenant_id"),
        Index("idx_blocked_output_created", "created_at"),
    )
