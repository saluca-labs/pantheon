"""Add _retention_policies table (Phase D).

Per-tenant retention policy. SaaS deployments pick a fixed tier
(7d/30d/90d/1yr/2yr), on-prem deployments may choose 'custom' with an
arbitrary custom_retention_days value. CHECK constraint enforces that
SaaS tenants cannot set retention_tier='custom'.

Seeds policy rows for every tenant currently in tiresias_licenses based on
their license tier:
  community / starter -> 7d
  pro                 -> 90d
  enterprise          -> 1yr
  mssp / saas / owner -> 2yr
  anything else       -> 30d (safe default)

Plan doc originally called this migration 0031 (and later 0032 per the
Tier 3 Phase D override). Revisions 0031 and 0032 were consumed by
soulkey_id / audit_log type fixes earlier this session, so this ships
as 0033. No functional change.

Revision ID: 0033
Revises: 0032
Create Date: 2026-04-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0033"
down_revision: str = "0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_retention_policies",
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=False),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("deployment_mode", sa.Text, nullable=False, server_default=sa.text("'saas'")),
        sa.Column("retention_tier", sa.Text, nullable=False, server_default=sa.text("'30d'")),
        sa.Column("custom_retention_days", sa.Integer, nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "deployment_mode IN ('saas','on_prem')",
            name="ck_retention_deployment_mode",
        ),
        sa.CheckConstraint(
            "retention_tier IN ('7d','30d','90d','1yr','2yr','custom')",
            name="ck_retention_tier_values",
        ),
        # SaaS tenants cannot select 'custom'; custom is on-prem only.
        sa.CheckConstraint(
            "(deployment_mode = 'on_prem') OR (retention_tier != 'custom')",
            name="ck_retention_saas_no_custom",
        ),
        # custom_retention_days only populated when tier == 'custom'.
        sa.CheckConstraint(
            "(retention_tier = 'custom' AND custom_retention_days IS NOT NULL AND custom_retention_days > 0)"
            " OR (retention_tier != 'custom' AND custom_retention_days IS NULL)",
            name="ck_retention_custom_days_coherent",
        ),
    )

    # Seed defaults for existing tenants BEFORE enabling FORCE RLS (owner role
    # is bypassed by ENABLE-only, but FORCE binds even table owners to policy).
    # tiresias_licenses.tenant_id is TEXT/VARCHAR(36); cast to UUID for insert.
    op.execute(
        """
        INSERT INTO _retention_policies (tenant_id, deployment_mode, retention_tier)
        SELECT
            tl.tenant_id::uuid,
            'saas' AS deployment_mode,
            CASE
                WHEN tl.tier IN ('community','starter') THEN '7d'
                WHEN tl.tier = 'pro'                    THEN '90d'
                WHEN tl.tier = 'enterprise'             THEN '1yr'
                WHEN tl.tier IN ('mssp','saas','owner') THEN '2yr'
                ELSE '30d'
            END AS retention_tier
        FROM tiresias_licenses tl
        WHERE tl.tenant_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        ON CONFLICT (tenant_id) DO NOTHING;
        """
    )

    # RLS: each tenant only sees its own policy row. The retention sweep
    # CronJob connects as a superuser-equivalent role (BYPASSRLS) or sets
    # app.current_tenant_id per tenant when reading policy rows.
    op.execute("ALTER TABLE _retention_policies ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE _retention_policies FORCE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON _retention_policies
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
        """
    )
    # Retention sweeper policy: when the caller sets app.retention_sweeper='on'
    # (trusted CronJob), all rows are visible. Gate is GUC-based so it cannot
    # be set by tenant traffic through the proxy (proxy only sets
    # app.current_tenant_id).
    op.execute(
        """
        CREATE POLICY retention_sweeper_read ON _retention_policies
            FOR SELECT
            USING (current_setting('app.retention_sweeper', true) = 'on');
        """
    )


def downgrade() -> None:
    # Reversible for staging. Drops seed rows as well.
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON _retention_policies;")
    op.drop_table("_retention_policies")
