"""Standardize metadata column name to metadata_ across all tables.

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-30
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Standardize metadata column to metadata_ (avoids SQLAlchemy reserved word conflict)
    # _soul_users already has metadata_ (renamed in earlier session)
    for table in ["_soul_tenants", "_soulauth_trials", "_soulauth_waitlist", "_soulkeys"]:
        op.alter_column(table, "metadata", new_column_name="metadata_")


def downgrade() -> None:
    for table in ["_soul_tenants", "_soulauth_trials", "_soulauth_waitlist", "_soulkeys"]:
        op.alter_column(table, "metadata_", new_column_name="metadata")
