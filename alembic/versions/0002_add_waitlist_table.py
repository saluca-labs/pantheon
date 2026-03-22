"""Add waitlist table for beta email collection

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_soulauth_waitlist",
        sa.Column("id", postgresql.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("contact_name", sa.Text(), nullable=False),
        sa.Column("contact_email", sa.Text(), nullable=False),
        sa.Column("company_name", sa.Text(), nullable=False),
        sa.Column("company_domain", sa.Text(), nullable=False),
        sa.Column("use_case", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("invited_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("contact_email"),
    )

    op.create_index("idx_waitlist_email", "_soulauth_waitlist", ["contact_email"])
    op.create_index("idx_waitlist_domain", "_soulauth_waitlist", ["company_domain"])


def downgrade() -> None:
    op.drop_index("idx_waitlist_domain", table_name="_soulauth_waitlist")
    op.drop_index("idx_waitlist_email", table_name="_soulauth_waitlist")
    op.drop_table("_soulauth_waitlist")
