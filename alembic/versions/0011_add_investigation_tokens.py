"""Add _investigation_tokens table for one-time evidence access.

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_investigation_tokens",
        sa.Column("id", sa.VARCHAR(36), primary_key=True),
        sa.Column("tenant_id", sa.VARCHAR(36), nullable=False, index=True),
        sa.Column("token_hash", sa.VARCHAR(64), nullable=False, unique=True),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("created_by", sa.VARCHAR(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.VARCHAR(20), server_default="active", nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_investigation_tokens_hash", "_investigation_tokens", ["token_hash"])
    op.create_index("idx_investigation_tokens_status", "_investigation_tokens", ["status"])


def downgrade() -> None:
    op.drop_index("idx_investigation_tokens_status")
    op.drop_index("idx_investigation_tokens_hash")
    op.drop_table("_investigation_tokens")
