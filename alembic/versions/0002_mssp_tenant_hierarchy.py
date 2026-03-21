"""Add MSSP tenant hierarchy columns to _soul_tenants

Adds parent_tenant_id (self-referential FK) and hierarchy_depth (int, 0-3)
to support MSSP multi-tenant parent-child relationships with depth enforcement.

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-21
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
    # Add parent_tenant_id self-referential FK (nullable -- root tenants have no parent)
    op.add_column(
        "_soul_tenants",
        sa.Column(
            "parent_tenant_id",
            postgresql.UUID(),
            sa.ForeignKey("_soul_tenants.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Add hierarchy_depth with CHECK constraint (0 = root, max = 3)
    op.add_column(
        "_soul_tenants",
        sa.Column(
            "hierarchy_depth",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="Depth in MSSP hierarchy. Max=3 enforced at application layer.",
        ),
    )

    # Add CHECK constraint for depth bounds
    op.create_check_constraint(
        "ck_soul_tenants_max_depth",
        "_soul_tenants",
        "hierarchy_depth >= 0 AND hierarchy_depth <= 3",
    )

    # Index for efficient subtree queries
    op.create_index(
        "idx_soul_tenants_parent",
        "_soul_tenants",
        ["parent_tenant_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_soul_tenants_parent", table_name="_soul_tenants")
    op.drop_constraint("ck_soul_tenants_max_depth", "_soul_tenants", type_="check")
    op.drop_column("_soul_tenants", "hierarchy_depth")
    op.drop_column("_soul_tenants", "parent_tenant_id")
