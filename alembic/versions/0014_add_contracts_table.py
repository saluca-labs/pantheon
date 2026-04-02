"""Add _soul_contracts table for hash-chain verified contract negotiation.

Revision ID: 0014
Revises: 0013
Create Date: 2026-04-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_soul_contracts",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("partner_id", sa.Uuid(), sa.ForeignKey("_soul_partners.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contract_type", sa.VARCHAR(50), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.VARCHAR(50), server_default="draft", nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.VARCHAR(128), nullable=False),
        sa.Column("prev_hash", sa.VARCHAR(128), nullable=True),
        sa.Column("submitted_by", sa.VARCHAR(255), nullable=False),
        sa.Column("review_status", sa.VARCHAR(50), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("review_risk_score", sa.Float(), nullable=True),
        sa.Column("pricing_terms", sa.JSON(), nullable=True),
        sa.Column("discount_code", sa.VARCHAR(64), nullable=True),
        sa.Column("signed_by_customer", sa.VARCHAR(255), nullable=True),
        sa.Column("signed_by_saluca", sa.VARCHAR(255), nullable=True),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("terminal_hash", sa.VARCHAR(128), nullable=True),
        sa.Column("metadata_", sa.JSON(), server_default="{}", nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_soul_contracts_tenant", "_soul_contracts", ["tenant_id"])
    op.create_index("idx_soul_contracts_partner", "_soul_contracts", ["partner_id"])
    op.create_index("idx_soul_contracts_status", "_soul_contracts", ["status"])
    op.create_index("idx_soul_contracts_hash", "_soul_contracts", ["content_hash"])


def downgrade() -> None:
    op.drop_table("_soul_contracts")
