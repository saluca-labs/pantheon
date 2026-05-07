"""Add _invoice_sync_log table (Tier 5 Phase 1).

Append-only audit trail for every billing action the aggregator + Stripe
webhook handlers take against a `_billing_periods` row. Phase 1 writers:
only the aggregator (actions: `billing_period.aggregated`, `billing_period.ready`,
and dry-run companions). Phase 2 adds Stripe-side actions
(`invoice.created`, `invoice.finalized`, `invoice.paid`, `invoice.failed`,
`grace.entered`, `grace.exited`, `mssp.child_downgrade_triggered`).

RLS: tenant-scoped read; aggregator bypasses via
`app.billing_aggregator='on'` GUC.

Revision ID: 0035
Revises: 0034
Create Date: 2026-04-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0035"
down_revision: str = "0034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_invoice_sync_log",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=False),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "billing_period_id",
            sa.dialects.postgresql.UUID(as_uuid=False),
            sa.ForeignKey("_billing_periods.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=False),
            nullable=False,
            index=True,
        ),
        sa.Column("action", sa.Text, nullable=False),
        sa.Column("stripe_object_id", sa.Text, nullable=True),
        sa.Column(
            "payload",
            sa.dialects.postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_invoice_sync_log_tenant_created",
        "_invoice_sync_log",
        ["tenant_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_invoice_sync_log_action",
        "_invoice_sync_log",
        ["action"],
    )

    op.execute("ALTER TABLE _invoice_sync_log ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE _invoice_sync_log FORCE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY tenant_isolation_invoice_sync_log ON _invoice_sync_log
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
        """
    )
    op.execute(
        """
        CREATE POLICY billing_aggregator_invoice_sync_log ON _invoice_sync_log
            USING (current_setting('app.billing_aggregator', true) = 'on')
            WITH CHECK (current_setting('app.billing_aggregator', true) = 'on');
        """
    )
    # Append-only: block UPDATE/DELETE via rule-level restriction (rows are mutable
    # only for aggregator/webhook that set the GUC; tenants never write here).
    op.execute(
        """
        CREATE RULE invoice_sync_log_no_update AS ON UPDATE TO _invoice_sync_log
            DO INSTEAD NOTHING;
        """
    )
    op.execute(
        """
        CREATE RULE invoice_sync_log_no_delete AS ON DELETE TO _invoice_sync_log
            DO INSTEAD NOTHING;
        """
    )


def downgrade() -> None:
    op.execute("DROP RULE IF EXISTS invoice_sync_log_no_delete ON _invoice_sync_log;")
    op.execute("DROP RULE IF EXISTS invoice_sync_log_no_update ON _invoice_sync_log;")
    op.execute("DROP POLICY IF EXISTS billing_aggregator_invoice_sync_log ON _invoice_sync_log;")
    op.execute("DROP POLICY IF EXISTS tenant_isolation_invoice_sync_log ON _invoice_sync_log;")
    op.drop_index("ix_invoice_sync_log_action", table_name="_invoice_sync_log")
    op.drop_index("ix_invoice_sync_log_tenant_created", table_name="_invoice_sync_log")
    op.drop_table("_invoice_sync_log")
