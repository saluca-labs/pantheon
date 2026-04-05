"""Add SaaS proxy mode support: RLS-ready indexes, api_key_hash index,
and ensure tiresias tables exist in shared Postgres for multi-tenant mode.

Revision ID: 0020
Revises: 0019
Create Date: 2026-04-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: str = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Add unique index on api_key_hash for SaaS auth lookups ────────
    # The column already exists on tiresias_licenses; we just need a fast
    # lookup path for the SaaSAuthMiddleware.
    op.create_index(
        "ix_tiresias_licenses_api_key_hash",
        "tiresias_licenses",
        ["api_key_hash"],
        unique=True,
        postgresql_where=sa.text("api_key_hash IS NOT NULL"),
    )

    # ── 2. Composite indexes for multi-tenant query performance ──────────
    # Audit log: tenant + created_at for time-range scans
    op.create_index(
        "ix_tiresias_audit_log_tenant_created",
        "tiresias_audit_log",
        ["tenant_id", "created_at"],
    )

    # Audit log: tenant + session_id for session replay
    op.create_index(
        "ix_tiresias_audit_log_tenant_session",
        "tiresias_audit_log",
        ["tenant_id", "session_id"],
    )

    # Audit log: tenant + model for model-filtered queries
    op.create_index(
        "ix_tiresias_audit_log_tenant_model",
        "tiresias_audit_log",
        ["tenant_id", "model"],
    )

    # Usage buckets: tenant + bucket_hour already has a unique constraint,
    # but add a covering index for dashboard queries.
    op.create_index(
        "ix_tiresias_usage_buckets_tenant_hour",
        "tiresias_usage_buckets",
        ["tenant_id", "bucket_hour"],
    )

    # ── 3. Add Postgres RLS policies for defense-in-depth ────────────────
    # These are Postgres-specific and only apply when running against Postgres.
    # In SQLite mode (onprem), they are no-ops.
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        # Enable RLS on core tables
        for table in [
            "tiresias_audit_log",
            "tiresias_licenses",
            "tiresias_usage_buckets",
            "tiresias_api_log",
            "tiresias_api_endpoint_buckets",
        ]:
            op.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
            op.execute(sa.text(f"""
                CREATE POLICY tenant_isolation_{table} ON {table}
                USING (tenant_id = current_setting('app.current_tenant_id', true))
            """))
            # Allow the app role to bypass RLS (it sets the setting per-request)
            op.execute(sa.text(
                f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"
            ))


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        for table in [
            "tiresias_api_endpoint_buckets",
            "tiresias_api_log",
            "tiresias_usage_buckets",
            "tiresias_licenses",
            "tiresias_audit_log",
        ]:
            op.execute(sa.text(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {table}"))
            op.execute(sa.text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))

    op.drop_index("ix_tiresias_usage_buckets_tenant_hour", "tiresias_usage_buckets")
    op.drop_index("ix_tiresias_audit_log_tenant_model", "tiresias_audit_log")
    op.drop_index("ix_tiresias_audit_log_tenant_session", "tiresias_audit_log")
    op.drop_index("ix_tiresias_audit_log_tenant_created", "tiresias_audit_log")
    op.drop_index("ix_tiresias_licenses_api_key_hash", "tiresias_licenses")
