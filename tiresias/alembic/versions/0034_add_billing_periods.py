"""Add _billing_periods table (Tier 5 Phase 1).

Aggregator-owned table. One row per (tenant_id, period_start) where
period_start is the first UTC day of a calendar month. Populated monthly
by the `tiresias-billing-aggregator` CronJob (scripts/billing_aggregator.py).

Phase 1 scope: data-pipeline only. Columns `stripe_invoice_id` and
`status` transitions beyond `draft`/`ready` are reserved for Phase 2
Stripe integration.

CESO anchors (2026-04-15, final):
  - calendar anchor with proration
  - direct-owner billing route: `direct` = Tiresias own Stripe;
    `partner` = via MSSP parent (Stripe Connect, Phase 2)
  - overage rate = $0.10 per 10,000 requests over tier limit

RLS: tenant-scoped; MSSP parent sees its children's rows via
parent_tenant_id match on _soul_tenants.

Revision ID: 0034
Revises: 0033
Create Date: 2026-04-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0034"
down_revision: str = "0033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ENUM types (Postgres native).
    op.execute(
        "CREATE TYPE billing_period_status AS ENUM "
        "('draft','ready','billed','paid','failed','voided');"
    )
    op.execute(
        "CREATE TYPE billing_route_kind AS ENUM ('direct','partner');"
    )

    op.create_table(
        "_billing_periods",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=False),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=False),
            nullable=False,
            index=True,
        ),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "draft", "ready", "billed", "paid", "failed", "voided",
                name="billing_period_status",
                create_type=False,
            ),
            nullable=False,
            server_default=sa.text("'draft'::billing_period_status"),
        ),
        sa.Column("tier_at_period_start", sa.Text, nullable=False),
        sa.Column("total_requests", sa.BigInteger, nullable=False, server_default=sa.text("0")),
        sa.Column("tier_included_requests", sa.BigInteger, nullable=False),
        sa.Column("overage_requests", sa.BigInteger, nullable=False, server_default=sa.text("0")),
        sa.Column("overage_cents", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("base_cents", sa.Integer, nullable=False),
        sa.Column("proration_cents", sa.Integer, nullable=False, server_default=sa.text("0")),
        # GENERATED column — total_cents = base + overage + proration, always recomputed.
        sa.Column(
            "total_cents",
            sa.Integer,
            sa.Computed("base_cents + overage_cents + proration_cents", persisted=True),
        ),
        sa.Column(
            "billing_route",
            postgresql.ENUM(
                "direct", "partner",
                name="billing_route_kind",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "mssp_parent_id",
            sa.dialects.postgresql.UUID(as_uuid=False),
            nullable=True,
        ),
        sa.Column("stripe_invoice_id", sa.Text, nullable=True),
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
        sa.UniqueConstraint("tenant_id", "period_start", name="uq_billing_periods_tenant_period"),
        sa.CheckConstraint("period_end >= period_start", name="ck_billing_periods_period_order"),
        sa.CheckConstraint(
            "overage_requests >= 0 AND overage_cents >= 0 AND base_cents >= 0",
            name="ck_billing_periods_nonneg",
        ),
    )

    op.create_index(
        "ix_billing_periods_status",
        "_billing_periods",
        ["status"],
    )
    op.create_index(
        "ix_billing_periods_mssp_parent",
        "_billing_periods",
        ["mssp_parent_id"],
    )

    # RLS: tenants see their own rows; MSSP parents see child rows too.
    # Aggregator CronJob uses a trusted GUC `app.billing_aggregator='on'` to read all rows.
    op.execute("ALTER TABLE _billing_periods ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE _billing_periods FORCE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY tenant_isolation_billing_periods ON _billing_periods
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
        """
    )
    op.execute(
        """
        CREATE POLICY mssp_parent_read_billing_periods ON _billing_periods
            FOR SELECT
            USING (
                mssp_parent_id IS NOT NULL
                AND mssp_parent_id = current_setting('app.current_tenant_id', true)::uuid
            );
        """
    )
    op.execute(
        """
        CREATE POLICY billing_aggregator_all ON _billing_periods
            USING (current_setting('app.billing_aggregator', true) = 'on')
            WITH CHECK (current_setting('app.billing_aggregator', true) = 'on');
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS billing_aggregator_all ON _billing_periods;")
    op.execute("DROP POLICY IF EXISTS mssp_parent_read_billing_periods ON _billing_periods;")
    op.execute("DROP POLICY IF EXISTS tenant_isolation_billing_periods ON _billing_periods;")
    op.drop_index("ix_billing_periods_mssp_parent", table_name="_billing_periods")
    op.drop_index("ix_billing_periods_status", table_name="_billing_periods")
    op.drop_table("_billing_periods")
    op.execute("DROP TYPE IF EXISTS billing_route_kind;")
    op.execute("DROP TYPE IF EXISTS billing_period_status;")
