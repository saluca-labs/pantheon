"""Add _partner_applications table for public partner onboarding flow.

Revision ID: 0023
Revises: 0022
Create Date: 2026-04-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0023"
down_revision: str = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_partner_applications",
        sa.Column("id", sa.String(36), primary_key=True, server_default=sa.text("gen_random_uuid()::text")),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("linkedin_url", sa.String(512), nullable=False),
        sa.Column("tos_accepted_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("reviewed_by", sa.String(255), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_partner_applications_email", "_partner_applications", ["email"], unique=True)
    op.create_index("ix_partner_applications_status", "_partner_applications", ["status"])


def downgrade() -> None:
    op.drop_index("ix_partner_applications_status", table_name="_partner_applications")
    op.drop_index("ix_partner_applications_email", table_name="_partner_applications")
    op.drop_table("_partner_applications")
