"""Add local auth support - password_hash column and provider_type expansion.

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add password_hash column to _soul_users
    op.add_column("_soul_users", sa.Column("password_hash", sa.Text(), nullable=True))

    # Add auth_provider column to track how user authenticates (oidc, local, ldap)
    op.add_column("_soul_users", sa.Column("auth_provider", sa.Text(), nullable=True, server_default="oidc"))


def downgrade() -> None:
    op.drop_column("_soul_users", "auth_provider")
    op.drop_column("_soul_users", "password_hash")
