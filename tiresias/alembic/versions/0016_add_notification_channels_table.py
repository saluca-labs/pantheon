"""Add _notification_channels table for per-tenant alert delivery config.

Revision ID: 0016
Revises: 0015
Create Date: 2026-04-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_notification_channels",
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
        # slack, pagerduty, email, teams, opsgenie, sns, webhook
        sa.Column("channel_type", sa.VARCHAR(30), nullable=False),
        # Encrypted JSON blob with webhook URL, API key, SMTP creds, etc.
        sa.Column("config_encrypted", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default="true", nullable=False),
        # Minimum severity to deliver: low, medium, high, critical
        sa.Column(
            "severity_threshold",
            sa.VARCHAR(20),
            server_default="medium",
            nullable=False,
        ),
        # Last test result
        sa.Column("test_status", sa.VARCHAR(20), nullable=True),  # passed | failed
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
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
        "idx_notification_channels_tenant",
        "_notification_channels",
        ["tenant_id"],
    )
    op.create_index(
        "idx_notification_channels_type",
        "_notification_channels",
        ["channel_type"],
    )


def downgrade() -> None:
    op.drop_table("_notification_channels")
