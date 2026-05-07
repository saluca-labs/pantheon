"""Alter tiresias_audit_log.soulkey_id from UUID to TEXT for ORM compatibility.

The ORM declares soulkey_id as String(36); migration 0031 created it as UUID,
which causes asyncpg DatatypeMismatchError on INSERT because SQLAlchemy binds
the column as VARCHAR. Coerce to TEXT to match the ORM. Null values are
preserved. The partial index is recreated against the new column type.

Revision ID: 0032
Revises: 0031
Create Date: 2026-04-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0032"
down_revision: str = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop partial index; can't alter column type while index depends on it.
    op.drop_index(
        "ix_tiresias_audit_log_soulkey_created",
        table_name="tiresias_audit_log",
    )
    # Convert UUID -> TEXT (lossless; null preserved).
    op.alter_column(
        "tiresias_audit_log",
        "soulkey_id",
        type_=sa.String(36),
        existing_type=sa.dialects.postgresql.UUID(as_uuid=False),
        existing_nullable=True,
        postgresql_using="soulkey_id::text",
    )
    op.create_index(
        "ix_tiresias_audit_log_soulkey_created",
        "tiresias_audit_log",
        ["soulkey_id", "created_at"],
        postgresql_where=sa.text("soulkey_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_tiresias_audit_log_soulkey_created",
        table_name="tiresias_audit_log",
    )
    op.alter_column(
        "tiresias_audit_log",
        "soulkey_id",
        type_=sa.dialects.postgresql.UUID(as_uuid=False),
        existing_type=sa.String(36),
        existing_nullable=True,
        postgresql_using="soulkey_id::uuid",
    )
    op.create_index(
        "ix_tiresias_audit_log_soulkey_created",
        "tiresias_audit_log",
        ["soulkey_id", "created_at"],
        postgresql_where=sa.text("soulkey_id IS NOT NULL"),
    )
