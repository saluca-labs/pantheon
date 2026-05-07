"""Initial SoulAuth schema — all 6 tables from schema.sql

Revision ID: 0001
Revises: None
Create Date: 2026-03-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- _soul_tenants ---
    op.create_table(
        "_soul_tenants",
        sa.Column("id", postgresql.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.VARCHAR(255), nullable=False),
        sa.Column("slug", sa.VARCHAR(63), nullable=False),
        sa.Column("tier", sa.VARCHAR(50), server_default="free", nullable=False),
        sa.Column("status", sa.VARCHAR(50), server_default="active", nullable=False),
        sa.Column("metadata", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )

    # --- _soulkeys ---
    op.create_table(
        "_soulkeys",
        sa.Column("id", postgresql.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(), nullable=False),
        sa.Column("persona_id", sa.Text(), nullable=False),
        sa.Column("key_hash", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Text(),
            server_default="active",
            nullable=False,
        ),
        sa.Column("issued_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("suspended_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("suspended_by", sa.Text(), nullable=True),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("revoked_by", sa.Text(), nullable=True),
        sa.Column("revocation_reason", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key_hash"),
        sa.UniqueConstraint("tenant_id", "persona_id", "status"),
        sa.ForeignKeyConstraint(["tenant_id"], ["_soul_tenants.id"]),
        sa.CheckConstraint("status IN ('active', 'suspended', 'revoked')", name="ck_soulkeys_status"),
    )
    op.create_index("idx_soulkeys_hash", "_soulkeys", ["key_hash"])
    op.create_index("idx_soulkeys_tenant_persona", "_soulkeys", ["tenant_id", "persona_id"])
    op.create_index(
        "idx_soulkeys_active",
        "_soulkeys",
        ["status"],
        postgresql_where=sa.text("status = 'active'"),
    )

    # --- _soulauth_policy_cache ---
    op.create_table(
        "_soulauth_policy_cache",
        sa.Column("id", postgresql.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(), nullable=False),
        sa.Column("persona_id", sa.Text(), nullable=False),
        sa.Column("policy_version", sa.Text(), nullable=False),
        sa.Column("resolved_policy", postgresql.JSONB(), nullable=False),
        sa.Column("synced_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "persona_id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["_soul_tenants.id"]),
    )

    # --- _soulauth_audit ---
    op.create_table(
        "_soulauth_audit",
        sa.Column("id", postgresql.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(), nullable=False),
        sa.Column("timestamp", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("soulkey_id", postgresql.UUID(), nullable=True),
        sa.Column("persona_id", sa.Text(), nullable=True),
        sa.Column("resource", sa.Text(), nullable=True),
        sa.Column("action", sa.Text(), nullable=True),
        sa.Column("scope", sa.Text(), nullable=True),
        sa.Column("decision", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("capability_id", postgresql.UUID(), nullable=True),
        sa.Column("context", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_audit_tenant_time", "_soulauth_audit", ["tenant_id", sa.text("timestamp DESC")])
    op.create_index("idx_audit_soulkey", "_soulauth_audit", ["soulkey_id", sa.text("timestamp DESC")])
    op.create_index("idx_audit_event", "_soulauth_audit", ["event_type"])

    # --- _soulauth_delegations ---
    op.create_table(
        "_soulauth_delegations",
        sa.Column("id", postgresql.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(), nullable=False),
        sa.Column("grantor_id", postgresql.UUID(), nullable=False),
        sa.Column("grantee_persona", sa.Text(), nullable=False),
        sa.Column("resource", sa.Text(), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column("granted_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("revoked_by", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["grantor_id"], ["_soulkeys.id"]),
    )

    # --- _soulauth_trials ---
    op.create_table(
        "_soulauth_trials",
        sa.Column("id", postgresql.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(), nullable=True),
        sa.Column("contact_name", sa.Text(), nullable=False),
        sa.Column("contact_email", sa.Text(), nullable=False),
        sa.Column("company_name", sa.Text(), nullable=False),
        sa.Column("company_domain", sa.Text(), nullable=False),
        sa.Column("use_case", sa.Text(), nullable=True),
        sa.Column("email_verified", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("verification_token", sa.Text(), nullable=True),
        sa.Column("soulkey_id", postgresql.UUID(), nullable=True),
        sa.Column(
            "status",
            sa.Text(),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("activated_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("converted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_domain", "status"),
        sa.ForeignKeyConstraint(["tenant_id"], ["_soul_tenants.id"]),
        sa.ForeignKeyConstraint(["soulkey_id"], ["_soulkeys.id"]),
        sa.CheckConstraint(
            "status IN ('pending', 'active', 'expired', 'converted', 'churned')",
            name="ck_trials_status",
        ),
    )
    op.create_index("idx_trials_email", "_soulauth_trials", ["contact_email"])
    op.create_index("idx_trials_domain", "_soulauth_trials", ["company_domain"])
    op.create_index(
        "idx_trials_active",
        "_soulauth_trials",
        ["status"],
        postgresql_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    op.drop_table("_soulauth_trials")
    op.drop_table("_soulauth_delegations")
    op.drop_table("_soulauth_audit")
    op.drop_table("_soulauth_policy_cache")
    op.drop_table("_soulkeys")
    op.drop_table("_soul_tenants")
