"""Add partner_type column to _soul_partners and _partner_invitations.

Revision ID: 0020
Revises: 0019
Create Date: 2026-04-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: str = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add partner_type to _soul_partners with safe default
    op.add_column(
        "_soul_partners",
        sa.Column(
            "partner_type",
            sa.VARCHAR(20),
            server_default="reseller",
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_soul_partners_type",
        "_soul_partners",
        "partner_type IN ('reseller', 'mssp')",
    )
    op.create_index(
        "idx_soul_partners_type",
        "_soul_partners",
        ["partner_type"],
    )

    # Add partner_type to _partner_invitations
    op.add_column(
        "_partner_invitations",
        sa.Column(
            "partner_type",
            sa.VARCHAR(20),
            server_default="reseller",
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_partner_invitations_type",
        "_partner_invitations",
        "partner_type IN ('reseller', 'mssp')",
    )

    # Backfill: existing partners whose tenant is MSSP-tier get marked as 'mssp'
    op.execute("""
        UPDATE _soul_partners SET partner_type = 'mssp'
        WHERE tenant_id IN (
            SELECT id FROM _soul_tenants WHERE tier = 'mssp'
        )
    """)


def downgrade() -> None:
    op.drop_constraint("ck_partner_invitations_type", "_partner_invitations", type_="check")
    op.drop_column("_partner_invitations", "partner_type")
    op.drop_index("idx_soul_partners_type", "_soul_partners")
    op.drop_constraint("ck_soul_partners_type", "_soul_partners", type_="check")
    op.drop_column("_soul_partners", "partner_type")
