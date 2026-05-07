"""Add stripe_customer_id column to _soul_tenants with index.

Migrates existing stripe_customer_id values from metadata_ JSONB field
to the new dedicated column for indexed lookups.

Revision ID: 0012
Revises: 0011
Create Date: 2026-04-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("_soul_tenants", sa.Column("stripe_customer_id", sa.VARCHAR(255), nullable=True))
    op.create_index("idx_soul_tenants_stripe_customer", "_soul_tenants", ["stripe_customer_id"], unique=True)
    # Migrate existing values from metadata_ JSONB
    op.execute("""
        UPDATE _soul_tenants
        SET stripe_customer_id = metadata_->>'stripe_customer_id'
        WHERE metadata_->>'stripe_customer_id' IS NOT NULL
          AND metadata_->>'stripe_customer_id' != ''
    """)


def downgrade() -> None:
    op.drop_index("idx_soul_tenants_stripe_customer")
    op.drop_column("_soul_tenants", "stripe_customer_id")
