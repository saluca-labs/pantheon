"""Normalize tier default from 'free' to 'community' across all tables.

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Update existing 'free' rows to 'community'
    op.execute("UPDATE _soul_tenants SET tier = 'community' WHERE tier = 'free'")
    op.execute("UPDATE tiresias_licenses SET tier = 'community' WHERE tier = 'free'")
    # Change server default
    op.alter_column("_soul_tenants", "tier", server_default="community")
    op.alter_column("tiresias_licenses", "tier", server_default="community")


def downgrade() -> None:
    op.alter_column("_soul_tenants", "tier", server_default="free")
    op.alter_column("tiresias_licenses", "tier", server_default="free")
    op.execute("UPDATE _soul_tenants SET tier = 'free' WHERE tier = 'community'")
    op.execute("UPDATE tiresias_licenses SET tier = 'free' WHERE tier = 'community'")
