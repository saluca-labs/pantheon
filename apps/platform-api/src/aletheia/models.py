"""
SQLAlchemy ORM models for Aletheia CoT hash chain.
Tables: aletheia_cot_chain, aletheia_cot_content.
Follows conventions from src/database/models.py (UUID PK, mapped_column style).
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    String, Boolean, DateTime, Integer, BigInteger, LargeBinary,
    Index, ForeignKey, UniqueConstraint, Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.database.connection import Base


def _uuid_default():
    return uuid.uuid4()


def _now():
    return datetime.now(timezone.utc)


class AletheiaCoTChain(Base):
    """aletheia_cot_chain - SHA-512 linked chain of CoT extraction entries."""
    __tablename__ = "aletheia_cot_chain"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("_soul_tenants.id"), nullable=False,
    )
    chain_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    entry_index: Mapped[int] = mapped_column(BigInteger, nullable=False)
    request_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now,
    )
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    agent_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    cot_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    cot_token_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cot_byte_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    prev_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    entry_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    content_stored: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    content_ref: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=True,
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "chain_id", "entry_index", name="uq_cot_chain_tenant_chain_index"),
        Index("idx_cot_chain_tenant_time", "tenant_id", "timestamp"),
        Index("idx_cot_chain_request", "request_id"),
    )


class AletheiaCoTContent(Base):
    """aletheia_cot_content - AES-256-GCM encrypted CoT reasoning storage."""
    __tablename__ = "aletheia_cot_content"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid_default)
    chain_entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("aletheia_cot_chain.id", ondelete="CASCADE"), nullable=False,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    encrypted_content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    content_nonce: Mapped[bytes] = mapped_column(LargeBinary(12), nullable=False)
    content_tag: Mapped[bytes] = mapped_column(LargeBinary(16), nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=True,
    )
