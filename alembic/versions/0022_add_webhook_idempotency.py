"""Add _stripe_webhook_events idempotency table for partner webhook deduplication.

Revision ID: 0022
Revises: 0021
Create Date: 2026-04-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0022"
down_revision: str = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_stripe_webhook_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("event_id", sa.String(255), unique=True, nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("handler_result", sa.String(50), nullable=True),
        sa.Column("metadata_", sa.JSON(), nullable=True),
    )

    op.create_index(
        "idx_webhook_events_type",
        "_stripe_webhook_events",
        ["event_type"],
    )
    op.create_index(
        "idx_webhook_events_processed",
        "_stripe_webhook_events",
        ["processed_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_webhook_events_processed", "_stripe_webhook_events")
    op.drop_index("idx_webhook_events_type", "_stripe_webhook_events")
    op.drop_table("_stripe_webhook_events")
