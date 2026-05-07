"""Add _siem_connectors table for persistent SIEM connector configuration.

Revision ID: 0015
Revises: 0014
Create Date: 2026-04-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_siem_connectors",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            sa.Uuid(),
            sa.ForeignKey("_soul_tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.VARCHAR(100), nullable=False),
        sa.Column("kind", sa.VARCHAR(20), nullable=False),  # syslog | webhook
        sa.Column("enabled", sa.Boolean(), server_default="true", nullable=False),
        # Kind-specific config stored as JSON (syslog_host, webhook_url, etc.)
        sa.Column("config", sa.JSON(), server_default="{}", nullable=False),
        # Filters
        sa.Column(
            "filter_severity",
            sa.JSON(),
            server_default="[]",
            nullable=False,
        ),
        sa.Column(
            "filter_event_kind",
            sa.JSON(),
            server_default="[]",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_siem_connectors_tenant", "_siem_connectors", ["tenant_id"]
    )
    op.create_index(
        "idx_siem_connectors_kind", "_siem_connectors", ["kind"]
    )


def downgrade() -> None:
    op.drop_table("_siem_connectors")
