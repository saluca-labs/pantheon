"""Create Tiresias storage tables (out-of-band ORM tables not previously in alembic).

These five tables are defined in src/tiresias/storage/schema.py and were
historically created lazily via Base.metadata.create_all on first request
(see src/tiresias/storage/engine.py:56). That worked in dev but breaks
deploy-time `alembic upgrade head` against a cold DB: 0008 ALTERs
tiresias_audit_log before any migration creates it, so a fresh deployment
crashes with UndefinedTable.

This migration restores alembic's view of the schema so the subsequent
ALTER migrations (0008, 0017, 0018, 0024, 0031, 0032) walk a cold DB
cleanly.

Column policy: BASE columns only — i.e. the canonical ORM definitions in
schema.py minus columns that later migrations explicitly ADD. Columns that
later migrations DROP (jwt_signature on tiresias_licenses, dropped by 0017)
ARE included so the drop succeeds.

Per-table delta tracking:
    tiresias_audit_log
        + 0008  prompt_tokens, completion_tokens
        + 0018  encrypted_prompt, encrypted_completion
        + 0031  soulkey_id (UUID)
        ~ 0032  soulkey_id retyped UUID -> VARCHAR(36)
    tiresias_licenses
        - 0017  jwt_signature dropped (so we MUST create it here)
    tiresias_usage_buckets, tiresias_api_log, tiresias_api_endpoint_buckets
        no later ALTERs (0024 only adds indexes/RLS, no schema change)

Idempotent: online runs gate each create_table on inspector.has_table so
environments where ORM create_all has already populated the schema
(legacy dev/staging) won't crash with DuplicateTable. Offline runs (e.g.
`alembic upgrade --sql head`) emit CREATE TABLE IF NOT EXISTS / CREATE
INDEX IF NOT EXISTS so the generated SQL is safe to pipe into a
populated DB without crashing mid-transaction.

Revision ID: 0007a
Revises: 0007
Create Date: 2026-05-09
"""
from typing import Any, Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.schema import CreateIndex, CreateTable

# revision identifiers
revision: str = "0007a"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_offline() -> bool:
    from alembic import context as _ctx
    return _ctx.is_offline_mode()


def _has_table(name: str) -> bool:
    """Online: real inspector check.
    Offline: we can't introspect the target DB, so this returns False and
    callers fall through to _emit_create_table which writes
    `CREATE TABLE IF NOT EXISTS` — safe whether the table exists or not."""
    if _is_offline():
        return False
    bind = op.get_bind()
    return inspect(bind).has_table(name)


def _emit_create_table(name: str, *columns: Any, **kwargs: Any) -> None:
    """Dispatch on offline mode.

    Online: delegate to op.create_table (caller has already gated on
    _has_table, so the table is known absent).

    Offline: emit `CREATE TABLE IF NOT EXISTS …` via op.execute so a
    `--sql` pipeline against a populated DB no-ops instead of crashing
    with DuplicateTable mid-transaction.
    """
    if _is_offline():
        meta = sa.MetaData()
        table = sa.Table(name, meta, *columns, **kwargs)
        op.execute(CreateTable(table, if_not_exists=True))
    else:
        op.create_table(name, *columns, **kwargs)


def _emit_create_index(index_name: str, table_name: str, columns: Sequence[str], **kwargs: Any) -> None:
    """Same dispatch as _emit_create_table, for indexes."""
    if _is_offline():
        meta = sa.MetaData()
        cols = [sa.Column(c, sa.Text()) for c in columns]
        table = sa.Table(table_name, meta, *cols)
        idx = sa.Index(index_name, *[table.c[c] for c in columns], **kwargs)
        op.execute(CreateIndex(idx, if_not_exists=True))
    else:
        op.create_index(index_name, table_name, list(columns), **kwargs)


def upgrade() -> None:
    # ── tiresias_audit_log ────────────────────────────────────────────────
    # Canonical ORM minus { prompt_tokens, completion_tokens, encrypted_prompt,
    # encrypted_completion, soulkey_id } which are added by later migrations.
    if not _has_table("tiresias_audit_log"):
        _emit_create_table(
            "tiresias_audit_log",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("tenant_id", sa.String(36), nullable=False),
            sa.Column("model", sa.String(128), nullable=True),
            sa.Column("provider", sa.String(64), nullable=True),
            sa.Column("token_count", sa.Integer(), nullable=True),
            sa.Column("cost_usd", sa.Float(), nullable=True),
            sa.Column("session_id", sa.String(128), nullable=True),
            sa.Column("metadata_json", sa.Text(), nullable=True),
            sa.Column("request_hash", sa.String(128), nullable=True),
            sa.Column("response_hash", sa.String(128), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
            ),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        )
        _emit_create_index(
            "ix_tiresias_audit_log_tenant_id",
            "tiresias_audit_log",
            ["tenant_id"],
        )
        _emit_create_index(
            "ix_tiresias_audit_log_session_id",
            "tiresias_audit_log",
            ["session_id"],
        )
        _emit_create_index(
            "ix_tiresias_audit_log_created_at",
            "tiresias_audit_log",
            ["created_at"],
        )

    # ── tiresias_licenses ─────────────────────────────────────────────────
    # Canonical ORM PLUS jwt_signature (later dropped by 0017). Keeping
    # jwt_signature here lets 0017 succeed on cold DBs.
    if not _has_table("tiresias_licenses"):
        _emit_create_table(
            "tiresias_licenses",
            sa.Column("tenant_id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("tier", sa.String(32), nullable=False, server_default="community"),
            sa.Column("feature_flags", sa.Text(), nullable=True),
            sa.Column("kek_provider", sa.String(32), nullable=False, server_default="local"),
            sa.Column("retention_days", sa.Integer(), nullable=False, server_default="30"),
            sa.Column("wrapped_dek", sa.LargeBinary(), nullable=True),
            sa.Column("api_key_hash", sa.String(128), nullable=True),
            sa.Column("config_json", sa.Text(), nullable=True),
            sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("expiry", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
            ),
            # Vestigial column dropped by 0017; created here so the cold-DB
            # walk reaches 0017 with the column present.
            sa.Column("jwt_signature", sa.String(512), nullable=True),
        )

    # ── tiresias_usage_buckets ────────────────────────────────────────────
    # No later schema deltas; canonical ORM matches BASE.
    if not _has_table("tiresias_usage_buckets"):
        _emit_create_table(
            "tiresias_usage_buckets",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("tenant_id", sa.String(36), nullable=False),
            sa.Column("bucket_hour", sa.DateTime(timezone=True), nullable=False),
            sa.Column("token_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("request_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
            sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
            sa.UniqueConstraint(
                "tenant_id",
                "bucket_hour",
                name="uq_tiresias_usage_buckets_tenant_hour",
            ),
        )
        _emit_create_index(
            "ix_tiresias_usage_buckets_tenant_id",
            "tiresias_usage_buckets",
            ["tenant_id"],
        )

    # ── tiresias_api_log ──────────────────────────────────────────────────
    # No later schema deltas; canonical ORM matches BASE.
    if not _has_table("tiresias_api_log"):
        _emit_create_table(
            "tiresias_api_log",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("tenant_id", sa.String(36), nullable=False),
            sa.Column("api_service", sa.String(64), nullable=True),
            sa.Column("method", sa.String(16), nullable=False),
            sa.Column("path", sa.String(1024), nullable=False),
            sa.Column("path_pattern", sa.String(1024), nullable=False),
            sa.Column("status_code", sa.Integer(), nullable=False),
            sa.Column("latency_ms", sa.Float(), nullable=False),
            sa.Column("request_size", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("response_size", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
            ),
        )
        _emit_create_index(
            "ix_tiresias_api_log_tenant_id",
            "tiresias_api_log",
            ["tenant_id"],
        )
        _emit_create_index(
            "ix_tiresias_api_log_api_service",
            "tiresias_api_log",
            ["api_service"],
        )
        _emit_create_index(
            "ix_tiresias_api_log_path_pattern",
            "tiresias_api_log",
            ["path_pattern"],
        )
        _emit_create_index(
            "ix_tiresias_api_log_status_code",
            "tiresias_api_log",
            ["status_code"],
        )
        _emit_create_index(
            "ix_tiresias_api_log_created_at",
            "tiresias_api_log",
            ["created_at"],
        )

    # ── tiresias_api_endpoint_buckets ─────────────────────────────────────
    # No later schema deltas; canonical ORM matches BASE.
    if not _has_table("tiresias_api_endpoint_buckets"):
        _emit_create_table(
            "tiresias_api_endpoint_buckets",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("tenant_id", sa.String(36), nullable=False),
            sa.Column("api_service", sa.String(64), nullable=True),
            sa.Column("method", sa.String(16), nullable=False),
            sa.Column("path_pattern", sa.String(1024), nullable=False),
            sa.Column("bucket_hour", sa.DateTime(timezone=True), nullable=False),
            sa.Column("request_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("latency_sum_ms", sa.Float(), nullable=False, server_default="0"),
            sa.Column("latency_min_ms", sa.Float(), nullable=False, server_default="0"),
            sa.Column("latency_max_ms", sa.Float(), nullable=False, server_default="0"),
            sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
            sa.UniqueConstraint(
                "tenant_id",
                "api_service",
                "method",
                "path_pattern",
                "bucket_hour",
                name="uq_tiresias_api_endpoint_buckets_full",
            ),
        )
        _emit_create_index(
            "ix_tiresias_api_endpoint_buckets_tenant_id",
            "tiresias_api_endpoint_buckets",
            ["tenant_id"],
        )


def downgrade() -> None:
    op.drop_table("tiresias_api_endpoint_buckets")
    op.drop_table("tiresias_api_log")
    op.drop_table("tiresias_usage_buckets")
    op.drop_table("tiresias_licenses")
    op.drop_table("tiresias_audit_log")
