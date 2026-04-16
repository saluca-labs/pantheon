"""Add dek_id column to aletheia_cot_content (Tier 4 Piece A conditional).

Schema probe (2026-04-15) confirmed `aletheia_cot_content` did not have a
`dek_id` column. Tier 4 Piece A (decrypt-scope + MFA step-up) requires a
per-row DEK anchor so that audit log entries can reference the exact DEK
used to encrypt the CoT payload. Nullable to allow backfill; an indexed
lookup column so Aletheia reveal queries can JOIN on it efficiently.

Revision ID: 0038
Revises: 0037
Create Date: 2026-04-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0038"
down_revision: str = "0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "aletheia_cot_content",
        sa.Column(
            "dek_id",
            sa.dialects.postgresql.UUID(as_uuid=False),
            nullable=True,
        ),
    )
    op.create_index(
        "idx_aletheia_cot_content_dek_id",
        "aletheia_cot_content",
        ["dek_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_aletheia_cot_content_dek_id",
        table_name="aletheia_cot_content",
    )
    op.drop_column("aletheia_cot_content", "dek_id")
