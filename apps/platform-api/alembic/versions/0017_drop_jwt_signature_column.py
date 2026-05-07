"""Drop vestigial jwt_signature column from tiresias_licenses.

Revision ID: 0017
Revises: 0016
Create Date: 2026-04-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("tiresias_licenses", "jwt_signature")


def downgrade() -> None:
    op.add_column(
        "tiresias_licenses",
        sa.Column("jwt_signature", sa.String(512), nullable=True),
    )
