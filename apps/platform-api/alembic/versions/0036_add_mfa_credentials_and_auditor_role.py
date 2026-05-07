"""Add _mfa_credentials table and 'auditor' admin role (Tier 4 Piece A).

Creates the polymorphic MFA credential storage table backing WebAuthn
(primary) + TOTP (fallback) enrollment for both soulkeys (agents/services)
and soul_users (portal OIDC users). Subject identity is polymorphic via
(subject_type, subject_id). RLS is enforced via subject->tenant lookup
using PL/pgSQL helper; aggregator-style GUC bypass is NOT provided here
because MFA enrollment is always done in-tenant.

Also extends the `_soul_users.admin_role` CHECK constraint to include
'auditor' (read-only audit + decrypt-scope role; paired with AdminRole
Python enum in src/auth/rbac.py).

Revision ID: 0036
Revises: 0035
Create Date: 2026-04-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0036"
down_revision: str = "0035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. _mfa_credentials table (WebAuthn + TOTP, polymorphic subject)
    # ------------------------------------------------------------------
    op.create_table(
        "_mfa_credentials",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=False),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("subject_type", sa.Text, nullable=False),
        sa.Column(
            "subject_id",
            sa.dialects.postgresql.UUID(as_uuid=False),
            nullable=False,
        ),
        sa.Column("credential_type", sa.Text, nullable=False),
        sa.Column("credential_id", sa.Text, nullable=True),
        sa.Column("public_key", sa.LargeBinary, nullable=True),
        sa.Column("totp_secret_encrypted", sa.LargeBinary, nullable=True),
        sa.Column(
            "aaguid",
            sa.dialects.postgresql.UUID(as_uuid=False),
            nullable=True,
        ),
        sa.Column("sign_count", sa.BigInteger, nullable=False, server_default=sa.text("0")),
        sa.Column("nickname", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("last_used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint(
            "subject_type IN ('soulkey','soul_user')",
            name="ck_mfa_credentials_subject_type",
        ),
        sa.CheckConstraint(
            "credential_type IN ('webauthn','totp')",
            name="ck_mfa_credentials_credential_type",
        ),
    )

    op.create_index(
        "idx_mfa_subject",
        "_mfa_credentials",
        ["subject_type", "subject_id"],
    )
    op.execute(
        """
        CREATE UNIQUE INDEX idx_mfa_webauthn_unique
            ON _mfa_credentials(subject_type, subject_id, credential_id)
            WHERE credential_id IS NOT NULL;
        """
    )

    # ------------------------------------------------------------------
    # 2. RLS: tenant isolation via subject -> tenant lookup
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION _mfa_credentials_tenant(st TEXT, sid UUID)
        RETURNS UUID
        LANGUAGE sql
        STABLE
        AS $$
            SELECT CASE st
                WHEN 'soulkey'   THEN (SELECT tenant_id FROM _soulkeys   WHERE id = sid)
                WHEN 'soul_user' THEN (SELECT tenant_id FROM _soul_users WHERE id = sid)
                ELSE NULL
            END;
        $$;
        """
    )

    op.execute("ALTER TABLE _mfa_credentials ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE _mfa_credentials FORCE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY tenant_isolation_mfa_credentials ON _mfa_credentials
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

    # ------------------------------------------------------------------
    # 3. Extend _soul_users.admin_role CHECK to include 'auditor'
    # ------------------------------------------------------------------
    op.execute("ALTER TABLE _soul_users DROP CONSTRAINT IF EXISTS ck_soul_users_admin_role;")
    op.execute(
        """
        ALTER TABLE _soul_users
            ADD CONSTRAINT ck_soul_users_admin_role
            CHECK (admin_role IN ('owner','admin','operator','viewer','auditor'));
        """
    )


def downgrade() -> None:
    # Revert admin_role CHECK
    op.execute("ALTER TABLE _soul_users DROP CONSTRAINT IF EXISTS ck_soul_users_admin_role;")
    op.execute(
        """
        ALTER TABLE _soul_users
            ADD CONSTRAINT ck_soul_users_admin_role
            CHECK (admin_role IN ('owner','admin','operator','viewer'));
        """
    )

    # Drop MFA table + policy + helper
    op.execute("DROP POLICY IF EXISTS tenant_isolation_mfa_credentials ON _mfa_credentials;")
    op.execute("DROP INDEX IF EXISTS idx_mfa_webauthn_unique;")
    op.drop_index("idx_mfa_subject", table_name="_mfa_credentials")
    op.drop_table("_mfa_credentials")
    op.execute("DROP FUNCTION IF EXISTS _mfa_credentials_tenant(TEXT, UUID);")
