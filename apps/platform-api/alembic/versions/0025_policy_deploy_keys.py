"""Add per-tenant SSH deploy keys for policy git push.

Revision ID: 0025
Revises: 0024
Create Date: 2026-04-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0025"
down_revision: str = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "_policy_deploy_keys",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("_soul_tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key_name", sa.String(255), nullable=False, comment="Human label, e.g. 'policy-sync-minipc'"),
        sa.Column("public_key", sa.Text(), nullable=False, comment="SSH public key content"),
        sa.Column("private_key_encrypted", sa.LargeBinary(), nullable=True,
                   comment="AES-256-GCM encrypted private key for cloud-managed keys"),
        sa.Column("fingerprint", sa.String(255), nullable=False,
                   comment="SSH key fingerprint (SHA256:...) for identification"),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "key_name", name="uq_policy_deploy_keys_tenant_key_name"),
        sa.CheckConstraint("status IN ('active', 'revoked')", name="ck_policy_deploy_keys_status"),
    )

    op.create_index("idx_policy_deploy_keys_tenant", "_policy_deploy_keys", ["tenant_id"])
    op.create_index("idx_policy_deploy_keys_fingerprint", "_policy_deploy_keys", ["fingerprint"])


def downgrade() -> None:
    op.drop_index("idx_policy_deploy_keys_fingerprint", "_policy_deploy_keys")
    op.drop_index("idx_policy_deploy_keys_tenant", "_policy_deploy_keys")
    op.drop_table("_policy_deploy_keys")
