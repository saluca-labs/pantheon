"""Add SSO/OIDC tables: _soul_users, _soul_idp_configs, _soul_oidc_sessions

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- _soul_users ---
    op.create_table(
        "_soul_users",
        sa.Column(
            "id",
            postgresql.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("tenant_id", postgresql.UUID(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column(
            "admin_role",
            sa.Text(),
            server_default="viewer",
            nullable=False,
        ),
        sa.Column("idp_sub", sa.Text(), nullable=True),
        sa.Column("idp_provider", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Text(),
            server_default="active",
            nullable=False,
        ),
        sa.Column("last_login", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "metadata_",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["_soul_tenants.id"]),
        sa.UniqueConstraint("tenant_id", "email", name="uq_soul_users_tenant_email"),
        sa.UniqueConstraint(
            "tenant_id",
            "idp_provider",
            "idp_sub",
            name="uq_soul_users_tenant_idp_sub",
        ),
        sa.CheckConstraint(
            "admin_role IN ('owner', 'admin', 'operator', 'viewer')",
            name="ck_soul_users_admin_role",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'suspended', 'deactivated')",
            name="ck_soul_users_status",
        ),
    )
    op.create_index("idx_soul_users_tenant", "_soul_users", ["tenant_id"])
    op.create_index("idx_soul_users_email", "_soul_users", ["email"])

    # --- _soul_idp_configs ---
    op.create_table(
        "_soul_idp_configs",
        sa.Column(
            "id",
            postgresql.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("tenant_id", postgresql.UUID(), nullable=False),
        sa.Column("provider_type", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=True),
        sa.Column("client_id", sa.Text(), nullable=False),
        sa.Column("client_secret_enc", sa.Text(), nullable=False),
        sa.Column("discovery_url", sa.Text(), nullable=True),
        sa.Column("issuer", sa.Text(), nullable=True),
        sa.Column(
            "scopes",
            postgresql.ARRAY(sa.Text()),
            server_default=sa.text("ARRAY['openid','email','profile']"),
            nullable=True,
        ),
        sa.Column(
            "claim_mapping",
            postgresql.JSONB(),
            server_default=sa.text('\'{"email": "email", "name": "name"}\'::jsonb'),
            nullable=True,
        ),
        sa.Column("domain_hint", sa.Text(), nullable=True),
        sa.Column(
            "group_role_map",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.Text(),
            server_default="active",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["_soul_tenants.id"]),
        sa.UniqueConstraint(
            "tenant_id",
            "provider_type",
            name="uq_soul_idp_configs_tenant_provider",
        ),
        sa.CheckConstraint(
            "provider_type IN ('google', 'okta', 'azure_ad', 'oidc')",
            name="ck_soul_idp_provider_type",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'disabled')",
            name="ck_soul_idp_status",
        ),
    )
    op.create_index("idx_soul_idp_configs_tenant", "_soul_idp_configs", ["tenant_id"])
    op.create_index("idx_soul_idp_configs_domain_hint", "_soul_idp_configs", ["domain_hint"])

    # --- _soul_oidc_sessions ---
    op.create_table(
        "_soul_oidc_sessions",
        sa.Column(
            "id",
            postgresql.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(), nullable=False),
        sa.Column("session_token", sa.Text(), nullable=False),
        sa.Column("refresh_token_enc", sa.Text(), nullable=True),
        sa.Column(
            "issued_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column(
            "last_active",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column("ip_address", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["_soul_users.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["_soul_tenants.id"]),
        sa.UniqueConstraint("session_token", name="uq_soul_oidc_sessions_token"),
    )
    op.create_index(
        "idx_soul_oidc_sessions_token", "_soul_oidc_sessions", ["session_token"]
    )
    op.create_index(
        "idx_soul_oidc_sessions_user_expires",
        "_soul_oidc_sessions",
        ["user_id", "expires_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_soul_oidc_sessions_user_expires", table_name="_soul_oidc_sessions")
    op.drop_index("idx_soul_oidc_sessions_token", table_name="_soul_oidc_sessions")
    op.drop_table("_soul_oidc_sessions")

    op.drop_index("idx_soul_idp_configs_domain_hint", table_name="_soul_idp_configs")
    op.drop_index("idx_soul_idp_configs_tenant", table_name="_soul_idp_configs")
    op.drop_table("_soul_idp_configs")

    op.drop_index("idx_soul_users_email", table_name="_soul_users")
    op.drop_index("idx_soul_users_tenant", table_name="_soul_users")
    op.drop_table("_soul_users")
