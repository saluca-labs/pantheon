"""Add encrypted_prompt and encrypted_completion columns to tiresias_audit_log.

The ORM model (tiresias.storage.schema.TiresiasAuditLog) already defines
these columns, but they were never added to existing prod databases via
migration — SQLAlchemy create_all only creates missing *tables*, not
missing columns on existing tables.  This caused INSERT/SELECT 500s.

Revision ID: 0018
Revises: 0017
Create Date: 2026-04-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tiresias_audit_log",
        sa.Column("encrypted_prompt", sa.LargeBinary(), nullable=True),
    )
    op.add_column(
        "tiresias_audit_log",
        sa.Column("encrypted_completion", sa.LargeBinary(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tiresias_audit_log", "encrypted_completion")
    op.drop_column("tiresias_audit_log", "encrypted_prompt")
