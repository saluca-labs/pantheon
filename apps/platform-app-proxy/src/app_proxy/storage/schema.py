"""ORM models for the App Proxy storage layer (SQLAlchemy 2.0 declarative)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, Index, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Shared declarative base for all App Proxy tables."""


class AppProxyAuditLog(Base):
    """Immutable audit record for every tool-call attempt through the proxy."""

    __tablename__ = "app_proxy_audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    agent_id: Mapped[str] = mapped_column(String(128), index=True)
    plugin_name: Mapped[str] = mapped_column(String(256), index=True)
    tool_name: Mapped[str] = mapped_column(String(256), index=True)

    # Call identity
    call_id: Mapped[str] = mapped_column(String(36), unique=True)
    arguments_hash: Mapped[str] = mapped_column(String(64))

    # Policy evaluation
    policy_decision: Mapped[str] = mapped_column(String(24))  # grant|deny|queue_for_approval
    policy_reason: Mapped[str] = mapped_column(Text)

    # Approval (populated only when decision == queue_for_approval)
    approval_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    approval_status: Mapped[Optional[str]] = mapped_column(
        String(16), nullable=True
    )  # pending|approved|denied
    approval_timestamp: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Execution outcome
    status: Mapped[str] = mapped_column(String(16))  # success|error|timeout|denied
    result_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Latency breakdown (milliseconds)
    dispatch_latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    plugin_latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Context
    session_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        index=True,
        server_default=func.now(),
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_audit_tenant_created", "tenant_id", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLog id={self.id!r} call_id={self.call_id!r} "
            f"plugin={self.plugin_name!r} tool={self.tool_name!r} "
            f"decision={self.policy_decision!r} status={self.status!r}>"
        )


class ApprovalQueue(Base):
    """Pending human-approval records for high-risk tool calls."""

    __tablename__ = "approval_queue"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    agent_id: Mapped[str] = mapped_column(String(128))
    plugin_name: Mapped[str] = mapped_column(String(256))
    tool_name: Mapped[str] = mapped_column(String(256))

    # Encrypted original arguments for re-dispatch after approval
    arguments_encrypted: Mapped[str] = mapped_column(Text)

    status: Mapped[str] = mapped_column(
        String(16), index=True
    )  # pending|approved|denied|expired
    reason: Mapped[str] = mapped_column(Text)

    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # Links back to the audit log
    call_id: Mapped[str] = mapped_column(String(36), index=True)

    def __repr__(self) -> str:
        return (
            f"<ApprovalQueue id={self.id!r} call_id={self.call_id!r} "
            f"status={self.status!r} plugin={self.plugin_name!r}>"
        )
