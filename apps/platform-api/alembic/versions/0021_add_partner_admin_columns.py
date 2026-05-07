"""Add admin lifecycle columns to _soul_partners.

Adds deactivation tracking (deactivated_at, deactivated_reason, deactivated_by),
updated_at timestamp, payout_frequency, and check constraints for status and
payout_frequency values.

Revision ID: 0021
Revises: 0020
Create Date: 2026-04-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: str = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Deactivation tracking columns ---
    op.add_column(
        "_soul_partners",
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "_soul_partners",
        sa.Column("deactivated_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "_soul_partners",
        sa.Column("deactivated_by", sa.String(255), nullable=True),
    )

    # --- Updated-at timestamp for term changes ---
    op.add_column(
        "_soul_partners",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
    )

    # --- Payout frequency ---
    op.add_column(
        "_soul_partners",
        sa.Column(
            "payout_frequency",
            sa.VARCHAR(20),
            server_default="monthly",
            nullable=False,
        ),
    )

    # --- Check constraints ---
    # status column already exists from migration 0013; add allowed-values constraint
    op.create_check_constraint(
        "ck_soul_partners_status",
        "_soul_partners",
        "status IN ('active', 'suspended', 'deactivated', 'pending')",
    )

    op.create_check_constraint(
        "ck_soul_partners_payout_frequency",
        "_soul_partners",
        "payout_frequency IN ('monthly', 'quarterly')",
    )

    # --- Index on status (if not already present, create; migration 0013 created
    # idx_soul_partners_status so this is a no-op guard) ---
    # idx_soul_partners_status already exists from 0013, skip re-creation.


def downgrade() -> None:
    op.drop_constraint("ck_soul_partners_payout_frequency", "_soul_partners", type_="check")
    op.drop_constraint("ck_soul_partners_status", "_soul_partners", type_="check")
    op.drop_column("_soul_partners", "payout_frequency")
    op.drop_column("_soul_partners", "updated_at")
    op.drop_column("_soul_partners", "deactivated_by")
    op.drop_column("_soul_partners", "deactivated_reason")
    op.drop_column("_soul_partners", "deactivated_at")
