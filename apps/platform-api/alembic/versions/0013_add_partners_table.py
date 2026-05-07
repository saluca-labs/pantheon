"""Add _soul_partners table and _partner_invitations table.

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Partners table
    op.create_table(
        "_soul_partners",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("name", sa.VARCHAR(255), nullable=False),
        sa.Column("contact_email", sa.VARCHAR(255), nullable=False),
        sa.Column("stripe_connect_account_id", sa.VARCHAR(255), nullable=True, unique=True),
        sa.Column("stripe_connect_status", sa.VARCHAR(50), server_default="pending", nullable=False),
        sa.Column("commission_rate", sa.Float(), server_default="0.40", nullable=False),
        sa.Column("referral_code", sa.VARCHAR(64), nullable=False, unique=True),
        sa.Column("parent_partner_id", sa.Uuid(), sa.ForeignKey("_soul_partners.id", ondelete="SET NULL"), nullable=True),
        sa.Column("override_commission_rate", sa.Float(), server_default="0.10", nullable=False),
        sa.Column("status", sa.VARCHAR(50), server_default="pending", nullable=False),
        sa.Column("contract_hash", sa.VARCHAR(128), nullable=True),
        sa.Column("metadata_", sa.JSON(), server_default="{}", nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", sa.VARCHAR(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_soul_partners_referral_code", "_soul_partners", ["referral_code"])
    op.create_index("idx_soul_partners_stripe_connect", "_soul_partners", ["stripe_connect_account_id"])
    op.create_index("idx_soul_partners_status", "_soul_partners", ["status"])
    op.create_index("idx_soul_partners_parent", "_soul_partners", ["parent_partner_id"])

    # Partner invitation tokens
    op.create_table(
        "_partner_invitations",
        sa.Column("id", sa.VARCHAR(36), primary_key=True),
        sa.Column("token_hash", sa.VARCHAR(64), nullable=False, unique=True),
        sa.Column("partner_name", sa.VARCHAR(255), nullable=False),
        sa.Column("contact_email", sa.VARCHAR(255), nullable=False),
        sa.Column("commission_rate", sa.Float(), server_default="0.40", nullable=False),
        sa.Column("parent_partner_id", sa.Uuid(), sa.ForeignKey("_soul_partners.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", sa.VARCHAR(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.VARCHAR(20), server_default="active", nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resulting_partner_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_partner_invitations_hash", "_partner_invitations", ["token_hash"])


def downgrade() -> None:
    op.drop_table("_partner_invitations")
    op.drop_table("_soul_partners")
