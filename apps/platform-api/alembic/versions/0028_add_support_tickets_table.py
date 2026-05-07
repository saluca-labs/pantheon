"""Add support_tickets table

Revision ID: 0028
Revises: 0027
Create Date: 2026-04-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0028"
down_revision: str = "0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_support_tickets",
        sa.Column(
            "id",
            postgresql.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("ticket_id", sa.Text(), nullable=False, unique=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(),
            sa.ForeignKey("_soul_tenants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default="open",
        ),
        sa.Column(
            "severity",
            sa.Text(),
            nullable=False,
            server_default="p2",
        ),
        sa.Column("category", sa.Text(), nullable=False, server_default="bug"),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("contact_email", sa.Text(), nullable=True),
        sa.Column("contact_name", sa.Text(), nullable=True),
        sa.Column("linear_url", sa.Text(), nullable=True),
        sa.Column("sla_deadline", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("acknowledged_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('open','acknowledged','in_progress','resolved','closed')",
            name="ck_support_tickets_status",
        ),
        sa.CheckConstraint(
            "severity IN ('p0','p1','p2','p3')",
            name="ck_support_tickets_severity",
        ),
    )
    op.create_index("idx_support_tickets_tenant", "_support_tickets", ["tenant_id"])
    op.create_index("idx_support_tickets_status", "_support_tickets", ["status"])


def downgrade() -> None:
    op.drop_index("idx_support_tickets_status", "_support_tickets")
    op.drop_index("idx_support_tickets_tenant", "_support_tickets")
    op.drop_table("_support_tickets")
