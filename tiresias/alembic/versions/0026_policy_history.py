"""Add policy version history table for rollback support.

Revision ID: 0026
Revises: 0025
Create Date: 2026-04-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0026"
down_revision: str = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_soulauth_policy_history",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("persona_id", sa.Text(), nullable=False),
        sa.Column("policy_version", sa.Text(), nullable=False),
        sa.Column("resolved_policy", sa.JSON(), nullable=False,
                   comment="Full policy snapshot at this version"),
        sa.Column("changed_by", sa.String(100), nullable=False,
                   comment="Who made the change: portal, git_sync, api, portal_rollback"),
        sa.Column("change_summary", sa.Text(), nullable=True,
                   comment="Human-readable description of what changed"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )

    op.create_index(
        "idx_policy_history_tenant_persona_time",
        "_soulauth_policy_history",
        ["tenant_id", "persona_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("idx_policy_history_tenant_persona_time", "_soulauth_policy_history")
    op.drop_table("_soulauth_policy_history")
