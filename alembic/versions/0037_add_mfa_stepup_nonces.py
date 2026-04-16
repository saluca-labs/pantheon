"""Add _mfa_stepup_nonces table (Tier 4 Piece A).

Single-use nonce table for MFA step-up tokens (short-lived JWT jti
registry). Any sensitive operation (decrypt-scope call, soulkey rotate,
policy promote, etc.) requires a step-up assertion whose jti is recorded
here. Lookup marks `used_at`, making replay impossible.

RLS mirrors `_mfa_credentials`: tenant-scoped via subject -> tenant
lookup using the helper function created in 0036.

Revision ID: 0037
Revises: 0036
Create Date: 2026-04-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0037"
down_revision: str = "0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_mfa_stepup_nonces",
        sa.Column("jti", sa.Text, primary_key=True, nullable=False),
        sa.Column("subject_type", sa.Text, nullable=False),
        sa.Column(
            "subject_id",
            sa.dialects.postgresql.UUID(as_uuid=False),
            nullable=False,
        ),
        sa.Column("scope", sa.Text, nullable=False),
        sa.Column("issued_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint(
            "subject_type IN ('soulkey','soul_user')",
            name="ck_mfa_stepup_nonces_subject_type",
        ),
    )
    op.create_index(
        "idx_stepup_expires",
        "_mfa_stepup_nonces",
        ["expires_at"],
    )

    op.execute("ALTER TABLE _mfa_stepup_nonces ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE _mfa_stepup_nonces FORCE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY tenant_isolation_mfa_stepup_nonces ON _mfa_stepup_nonces
            USING (
                _mfa_credentials_tenant(subject_type, subject_id)
                = current_setting('app.current_tenant_id', true)::uuid
            )
            WITH CHECK (
                _mfa_credentials_tenant(subject_type, subject_id)
                = current_setting('app.current_tenant_id', true)::uuid
            );
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_mfa_stepup_nonces ON _mfa_stepup_nonces;")
    op.drop_index("idx_stepup_expires", table_name="_mfa_stepup_nonces")
    op.drop_table("_mfa_stepup_nonces")
