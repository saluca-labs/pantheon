"""Add Aletheia CoT hash chain tables

Creates aletheia_cot_chain and aletheia_cot_content tables for
tamper-evident Chain-of-Thought extraction and storage.

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002w"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- aletheia_cot_chain ---
    op.create_table(
        "aletheia_cot_chain",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("_soul_tenants.id"), nullable=False),
        sa.Column("chain_id", sa.Uuid(), nullable=False),
        sa.Column("entry_index", sa.BigInteger(), nullable=False),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("agent_id", sa.String(200), nullable=True),
        sa.Column("cot_hash", sa.String(128), nullable=False),
        sa.Column("cot_token_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cot_byte_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prev_hash", sa.String(128), nullable=False),
        sa.Column("entry_hash", sa.String(128), nullable=False),
        sa.Column("content_stored", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("content_ref", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "chain_id", "entry_index", name="uq_cot_chain_tenant_chain_index"),
    )
    op.create_index("idx_cot_chain_tenant_time", "aletheia_cot_chain", ["tenant_id", sa.text("timestamp DESC")])
    op.create_index("idx_cot_chain_request", "aletheia_cot_chain", ["request_id"])

    # --- aletheia_cot_content ---
    op.create_table(
        "aletheia_cot_content",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "chain_entry_id", sa.Uuid(),
            sa.ForeignKey("aletheia_cot_chain.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("encrypted_content", sa.LargeBinary(), nullable=False),
        sa.Column("content_nonce", sa.LargeBinary(12), nullable=False),
        sa.Column("content_tag", sa.LargeBinary(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("aletheia_cot_content")
    op.drop_index("idx_cot_chain_request", table_name="aletheia_cot_chain")
    op.drop_index("idx_cot_chain_tenant_time", table_name="aletheia_cot_chain")
    op.drop_table("aletheia_cot_chain")
