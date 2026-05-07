"""Add prev_hash column to _soulauth_audit for multi-replica hash chain integrity.

Previously the hash chain was maintained via a module-level _previous_hash
global, which breaks when multiple pods run simultaneously (each pod maintains
its own chain, producing diverging chains in the DB).

This migration adds a prev_hash column so that each audit event records its
predecessor hash. The application layer now SELECTs the latest prev_hash from
the database (with row-level locking) before inserting, making the chain
authoritative and consistent across all replicas.

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add prev_hash column - nullable so existing rows are backward-compatible.
    # New rows will always have a non-null value once the application is deployed.
    op.add_column(
        "_soulauth_audit",
        sa.Column(
            "prev_hash",
            sa.String(64),
            nullable=True,
            comment=(
                "SHA-256 hex digest of the previous audit row in the chain. "
                "NULL only for rows written before migration 0004. "
                "The genesis sentinel value 'genesis' is stored for the first row."
            ),
        ),
    )

    # Index to speed up the SELECT ... ORDER BY timestamp DESC FOR UPDATE
    # that the application issues before every INSERT.
    op.create_index(
        "idx_audit_prev_hash_lookup",
        "_soulauth_audit",
        ["timestamp"],
    )


def downgrade() -> None:
    op.drop_index("idx_audit_prev_hash_lookup", table_name="_soulauth_audit")
    op.drop_column("_soulauth_audit", "prev_hash")
