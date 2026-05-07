"""Add soulkey_id to tiresias_audit_log for per-key attribution + rate-spike detection.

Tier 1 Item 6 of the demo-polish plan. Plan originally scoped this as migration
0030, but 0030 was consumed earlier this session by the Phase B
`_security_audit` hash-chain table. This migration therefore ships as 0031.

Revision ID: 0031
Revises: 0030
Create Date: 2026-04-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0031"
down_revision: str = "0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tiresias_audit_log",
        sa.Column("soulkey_id", sa.dialects.postgresql.UUID(as_uuid=False), nullable=True),
    )
    # Primary lookup: find rows for a given soulkey, ordered by time.
    op.create_index(
        "ix_tiresias_audit_log_soulkey_created",
        "tiresias_audit_log",
        ["soulkey_id", "created_at"],
        postgresql_where=sa.text("soulkey_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_tiresias_audit_log_soulkey_created",
        table_name="tiresias_audit_log",
    )
    op.drop_column("tiresias_audit_log", "soulkey_id")
