"""SQLAlchemy model for persisted scheduled tool calls."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app_proxy.storage.schema import Base


class ScheduledCallRecord(Base):
    """Persists scheduled tool-call definitions across restarts."""

    __tablename__ = "scheduled_calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agent_id: Mapped[str] = mapped_column(String(128), index=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    plugin_name: Mapped[str] = mapped_column(String(256))
    tool_name: Mapped[str] = mapped_column(String(256))
    arguments_json: Mapped[str] = mapped_column(Text, default="{}")

    # Trigger configuration (exactly one should be set)
    cron_expr: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    interval_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Execution stats
    last_status: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)

    def __repr__(self) -> str:
        return (
            f"<ScheduledCallRecord id={self.id!r} tool={self.tool_name!r} "
            f"enabled={self.enabled} runs={self.run_count}>"
        )
