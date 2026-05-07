"""Add _soul_licenses table for persistent license records.

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_soul_licenses",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("license_key_hash", sa.VARCHAR(128), nullable=False, unique=True),
        sa.Column("tier", sa.VARCHAR(50), nullable=False),
        sa.Column("features", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("is_nfr", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("partner_id", sa.VARCHAR(128), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("grace_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.VARCHAR(50), server_default="active", nullable=False),
        sa.Column("jwt_claims", sa.JSON(), nullable=True),
        sa.Column("issued_by", sa.VARCHAR(255), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by", sa.VARCHAR(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_soul_licenses_tenant", "_soul_licenses", ["tenant_id"])
    op.create_index("idx_soul_licenses_status", "_soul_licenses", ["status"])


def downgrade() -> None:
    op.drop_index("idx_soul_licenses_status")
    op.drop_index("idx_soul_licenses_tenant")
    op.drop_table("_soul_licenses")
