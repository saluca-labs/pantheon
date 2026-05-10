"""Add prompt_tokens and completion_tokens columns to tiresias_audit_log.

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tiresias_audit_log", sa.Column("prompt_tokens", sa.Integer(), nullable=True))
    op.add_column("tiresias_audit_log", sa.Column("completion_tokens", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("tiresias_audit_log", "completion_tokens")
    op.drop_column("tiresias_audit_log", "prompt_tokens")
