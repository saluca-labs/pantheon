"""Add hash-chained _security_audit table (Phase B).

Creates append-only SECURITY audit table with per-tenant hash chain
(prev_hash + row_hash). Also enforces no-UPDATE / no-DELETE rules and
per-tenant RLS.

Revision ID: 0030
Revises: 0029
Create Date: 2026-04-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0030"
down_revision: str = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_security_audit",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.dialects.postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("ts", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("event_type", sa.Text, nullable=False),
        sa.Column("actor_id", sa.Text, nullable=False),
        sa.Column("actor_type", sa.Text, nullable=False),
        sa.Column("outcome", sa.Text, nullable=False),
        sa.Column("resource_type", sa.Text, nullable=False),
        sa.Column("resource_id", sa.Text, nullable=False),
        sa.Column("service", sa.Text, nullable=False),
        sa.Column("trace_id", sa.Text, nullable=True),
        sa.Column("request_id", sa.Text, nullable=True),
        sa.Column("session_id", sa.Text, nullable=True),
        sa.Column("payload", sa.dialects.postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("prev_hash", sa.Text, nullable=True),
        sa.Column("row_hash", sa.Text, nullable=False),
        sa.Column(
            "retention_until",
            sa.Date,
            nullable=False,
            server_default=sa.text("(CURRENT_DATE + INTERVAL '2 years')"),
        ),
        sa.CheckConstraint(
            "actor_type IN ('user','service','operator','system')",
            name="ck_security_audit_actor_type",
        ),
        sa.CheckConstraint(
            "outcome IN ('success','failure','blocked')",
            name="ck_security_audit_outcome",
        ),
    )

    op.execute("ALTER TABLE _security_audit ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE _security_audit FORCE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON _security_audit
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
        """
    )
    # Append-only: UPDATE and DELETE are silently no-ops via INSTEAD NOTHING rules.
    op.execute("CREATE RULE no_update_security_audit AS ON UPDATE TO _security_audit DO INSTEAD NOTHING;")
    op.execute("CREATE RULE no_delete_security_audit AS ON DELETE TO _security_audit DO INSTEAD NOTHING;")

    op.create_index(
        "idx_security_audit_tenant_ts",
        "_security_audit",
        ["tenant_id", sa.text("ts DESC")],
    )
    op.create_index(
        "idx_security_audit_event_type",
        "_security_audit",
        ["event_type"],
    )


def downgrade() -> None:
    # Reversible for staging. Production rows become unrecoverable once dropped.
    op.execute("DROP RULE IF EXISTS no_update_security_audit ON _security_audit;")
    op.execute("DROP RULE IF EXISTS no_delete_security_audit ON _security_audit;")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON _security_audit;")
    op.drop_index("idx_security_audit_event_type", table_name="_security_audit")
    op.drop_index("idx_security_audit_tenant_ts", table_name="_security_audit")
    op.drop_table("_security_audit")
