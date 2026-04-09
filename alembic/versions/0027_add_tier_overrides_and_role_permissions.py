"""Add tier_overrides and role_permissions tables

Revision ID: 0027
Revises: 0026
Create Date: 2026-04-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0027"
down_revision: str = "0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tier overrides - runtime tier configuration
    op.create_table(
        "tier_overrides",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tier_name", sa.String(50), nullable=False, unique=True),
        sa.Column("max_children", sa.Integer(), nullable=True, default=None),
        sa.Column("allowed_children", sa.JSON(), nullable=True, default=list, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Role permissions - runtime RBAC permission overrides
    op.create_table(
        "role_permissions",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("role_name", sa.String(50), nullable=False),
        sa.Column("permission", sa.String(100), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("role_name", "permission", "tenant_id", name="uq_role_permission_tenant"),
    )
    op.create_index("idx_role_permissions_role_name", "role_permissions", ["role_name"])
    op.create_index("idx_role_permissions_tenant", "role_permissions", ["tenant_id", "role_name"])


def downgrade() -> None:
    op.drop_index("idx_role_permissions_tenant", "role_permissions")
    op.drop_index("idx_role_permissions_role_name", "role_permissions")
    op.drop_table("role_permissions")
    op.drop_table("tier_overrides")
