"""Add team RBAC tables (_soul_teams, _soul_team_members, _soul_user_invites)
and account admin columns on _soul_users.

Revision ID: 0019
Revises: 0018
Create Date: 2026-04-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: str = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Create _soul_teams ────────────────────────────────────────────
    op.create_table(
        "_soul_teams",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.VARCHAR(255), nullable=False),
        sa.Column("slug", sa.VARCHAR(63), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default="false", nullable=False,
                  comment="Exactly one default team per tenant; new users land here"),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("_soul_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("metadata_", sa.JSON(), server_default=sa.text("'{}'::jsonb"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.UniqueConstraint("tenant_id", "slug", name="uq_soul_teams_tenant_slug"),
    )
    op.create_index("idx_soul_teams_tenant", "_soul_teams", ["tenant_id"])

    # ── 2. Create _soul_team_members ─────────────────────────────────────
    op.create_table(
        "_soul_team_members",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("team_id", sa.Uuid(), sa.ForeignKey("_soul_teams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("_soul_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_role", sa.VARCHAR(50), server_default="member", nullable=False,
                  comment="Team-scoped role: team_admin, analyst, member"),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("added_by", sa.Uuid(), sa.ForeignKey("_soul_users.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("team_id", "user_id", name="uq_soul_team_members_team_user"),
        sa.CheckConstraint("team_role IN ('team_admin', 'analyst', 'member')", name="ck_soul_team_members_role"),
    )
    op.create_index("idx_soul_team_members_team", "_soul_team_members", ["team_id"])
    op.create_index("idx_soul_team_members_user", "_soul_team_members", ["user_id"])

    # ── 3. Create _soul_user_invites ─────────────────────────────────────
    op.create_table(
        "_soul_user_invites",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_id", sa.Uuid(), sa.ForeignKey("_soul_teams.id", ondelete="SET NULL"), nullable=True,
                  comment="Target team; NULL = default team"),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("invited_role", sa.VARCHAR(50), server_default="viewer", nullable=False,
                  comment="Portal-level admin_role to assign on acceptance"),
        sa.Column("invited_team_role", sa.VARCHAR(50), server_default="member", nullable=False,
                  comment="Team-level role to assign on acceptance"),
        sa.Column("token_hash", sa.VARCHAR(128), nullable=False, unique=True,
                  comment="SHA-256 hash of the invite token sent via email"),
        sa.Column("invited_by", sa.Uuid(), sa.ForeignKey("_soul_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.VARCHAR(50), server_default="pending", nullable=False,
                  comment="pending | accepted | expired | revoked"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_user_id", sa.Uuid(), sa.ForeignKey("_soul_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.CheckConstraint("status IN ('pending', 'accepted', 'expired', 'revoked')", name="ck_soul_user_invites_status"),
    )
    op.create_index("idx_soul_user_invites_tenant", "_soul_user_invites", ["tenant_id"])
    op.create_index("idx_soul_user_invites_email", "_soul_user_invites", ["email"])
    op.create_index("idx_soul_user_invites_token", "_soul_user_invites", ["token_hash"])

    # ── 4. ALTER _soul_users — add account admin flags + primary_team_id ─
    op.add_column("_soul_users", sa.Column(
        "is_account_admin", sa.Boolean(), server_default="false", nullable=False,
        comment="Tenant-wide account admin; can manage all users/teams/billing",
    ))
    op.add_column("_soul_users", sa.Column(
        "is_secondary_admin", sa.Boolean(), server_default="false", nullable=False,
        comment="Secondary admin; full user/team management but cannot remove primary admin",
    ))
    op.add_column("_soul_users", sa.Column(
        "primary_team_id", sa.Uuid(),
        sa.ForeignKey("_soul_teams.id", ondelete="SET NULL", name="fk_soul_users_primary_team"),
        nullable=True,
        comment="User's primary/default team for scoping dashboards",
    ))

    # ── 5. Backfill: existing owners become account admins ───────────────
    op.execute("""
        UPDATE _soul_users
        SET is_account_admin = true
        WHERE admin_role = 'owner'
    """)

    # ── 6. Backfill: create a "Default" team for every existing tenant ───
    op.execute("""
        INSERT INTO _soul_teams (id, tenant_id, name, slug, is_default, created_at, updated_at)
        SELECT gen_random_uuid(), t.id, 'Default', 'default', true, now(), now()
        FROM _soul_tenants t
        WHERE NOT EXISTS (
            SELECT 1 FROM _soul_teams st WHERE st.tenant_id = t.id AND st.is_default = true
        )
    """)

    # ── 7. Backfill: add all existing users as members of their tenant's default team
    op.execute("""
        INSERT INTO _soul_team_members (id, team_id, user_id, team_role, joined_at)
        SELECT gen_random_uuid(), st.id, u.id, 'member', now()
        FROM _soul_users u
        JOIN _soul_teams st ON st.tenant_id = u.tenant_id AND st.is_default = true
        WHERE NOT EXISTS (
            SELECT 1 FROM _soul_team_members tm WHERE tm.team_id = st.id AND tm.user_id = u.id
        )
    """)

    # ── 8. Backfill: set primary_team_id for all existing users ──────────
    op.execute("""
        UPDATE _soul_users u
        SET primary_team_id = st.id
        FROM _soul_teams st
        WHERE st.tenant_id = u.tenant_id AND st.is_default = true
          AND u.primary_team_id IS NULL
    """)


def downgrade() -> None:
    op.drop_column("_soul_users", "primary_team_id")
    op.drop_column("_soul_users", "is_secondary_admin")
    op.drop_column("_soul_users", "is_account_admin")
    op.drop_table("_soul_user_invites")
    op.drop_table("_soul_team_members")
    op.drop_table("_soul_teams")
