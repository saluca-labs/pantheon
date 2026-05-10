"""Create SoulWatch storage tables (out-of-band ORM tables not previously in alembic).

These six tables are defined in soulWatch/src/database/models.py and were
historically created lazily via Base.metadata.create_all on first request
(see soulWatch/src/database/connection.py:64). That worked in dev but breaks
deploy-time `alembic upgrade head` against a cold DB: 0029 ADDs a column to
_soulwatch_detections before any migration creates it, so a fresh deployment
crashes with UndefinedTable.

This migration mirrors the 0007a tiresias fix: restore alembic's view of the
SoulWatch domain so the subsequent ALTER migration (0029) walks a cold DB
cleanly.

Column policy: BASE columns only — i.e. the canonical ORM definitions in
models.py minus columns that later migrations explicitly ADD.

Per-table delta tracking:
    _soulwatch_baselines       no later ALTERs
    _soulwatch_anomalies       no later ALTERs
    _soulwatch_detections      + 0029 noise_classification VARCHAR(64)
    _soulwatch_quarantines     no later ALTERs
    _soulwatch_dlq             no later ALTERs
    _soulwatch_custom_rules    no later ALTERs

Idempotent: online runs gate each create_table on inspector.has_table so
environments where ORM create_all has already populated the schema
(legacy dev/staging) won't crash with DuplicateTable. Offline runs (e.g.
`alembic upgrade --sql head`) emit CREATE TABLE IF NOT EXISTS / CREATE
INDEX IF NOT EXISTS so the generated SQL is safe to pipe into a
populated DB without crashing mid-transaction.

Revision ID: 0028a
Revises: 0028
Create Date: 2026-05-10
"""
from typing import Any, Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.schema import CreateIndex, CreateTable

# revision identifiers
revision: str = "0028a"
down_revision: Union[str, None] = "0028"
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
        # Reflect just enough column shape for the index definition.
        cols = [sa.Column(c, sa.Text()) for c in columns]
        table = sa.Table(table_name, meta, *cols)
        idx = sa.Index(index_name, *[table.c[c] for c in columns], **kwargs)
        op.execute(CreateIndex(idx, if_not_exists=True))
    else:
        op.create_index(index_name, table_name, list(columns), **kwargs)


def upgrade() -> None:
    # ── _soulwatch_baselines ─────────────────────────────────────────────
    # Persisted behavioral baselines per agent. No later schema deltas.
    if not _has_table("_soulwatch_baselines"):
        _emit_create_table(
            "_soulwatch_baselines",
            sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
            sa.Column("soulkey_id", sa.Uuid(), nullable=False, unique=True),
            sa.Column("typical_request_rate", sa.Float(), nullable=False, server_default="0"),
            sa.Column("typical_resources", sa.JSON(), nullable=True),
            sa.Column("typical_actions", sa.JSON(), nullable=True),
            sa.Column("typical_scopes", sa.JSON(), nullable=True),
            sa.Column("typical_hours", sa.JSON(), nullable=True),
            sa.Column("typical_denial_rate", sa.Float(), nullable=False, server_default="0"),
            sa.Column("typical_burst_size", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("events_analyzed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("lookback_hours", sa.Integer(), nullable=False, server_default="168"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        _emit_create_index(
            "idx_soulwatch_baselines_soulkey",
            "_soulwatch_baselines",
            ["soulkey_id"],
        )

    # ── _soulwatch_anomalies ─────────────────────────────────────────────
    # Detected anomalies with status tracking. No later schema deltas.
    if not _has_table("_soulwatch_anomalies"):
        _emit_create_table(
            "_soulwatch_anomalies",
            sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
            sa.Column("soulkey_id", sa.Uuid(), nullable=False),
            sa.Column("tenant_id", sa.Uuid(), nullable=True),
            sa.Column("anomaly_type", sa.String(length=50), nullable=False),
            sa.Column("severity", sa.String(length=20), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("evidence", sa.JSON(), nullable=True),
            sa.Column("baseline_value", sa.Text(), nullable=True),
            sa.Column("observed_value", sa.Text(), nullable=True),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="open"),
            sa.Column("acknowledged_by", sa.Text(), nullable=True),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("source_event_id", sa.Uuid(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
        _emit_create_index("idx_soulwatch_anomalies_soulkey", "_soulwatch_anomalies", ["soulkey_id"])
        _emit_create_index("idx_soulwatch_anomalies_type", "_soulwatch_anomalies", ["anomaly_type"])
        _emit_create_index("idx_soulwatch_anomalies_severity", "_soulwatch_anomalies", ["severity"])
        _emit_create_index("idx_soulwatch_anomalies_status", "_soulwatch_anomalies", ["status"])
        _emit_create_index("idx_soulwatch_anomalies_created", "_soulwatch_anomalies", ["created_at"])
        _emit_create_index("idx_soulwatch_anomalies_tenant", "_soulwatch_anomalies", ["tenant_id"])

    # ── _soulwatch_detections ────────────────────────────────────────────
    # Sigma rule match log. Canonical ORM minus { noise_classification }
    # which is added by migration 0029 (B7-FIX-HEALTH-PROBE-NOISE).
    # The matching idx_soulwatch_detections_noise partial index is also
    # created by 0029 and intentionally omitted here.
    if not _has_table("_soulwatch_detections"):
        _emit_create_table(
            "_soulwatch_detections",
            sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
            sa.Column("rule_id", sa.String(length=255), nullable=False),
            sa.Column("rule_title", sa.Text(), nullable=False),
            sa.Column("level", sa.String(length=30), nullable=False),
            sa.Column("soulkey_id", sa.Uuid(), nullable=True),
            sa.Column("tenant_id", sa.Uuid(), nullable=True),
            sa.Column("matched_fields", sa.JSON(), nullable=True),
            sa.Column("event_data", sa.JSON(), nullable=True),
            sa.Column("response_playbook", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
        _emit_create_index("idx_soulwatch_detections_rule", "_soulwatch_detections", ["rule_id"])
        _emit_create_index("idx_soulwatch_detections_level", "_soulwatch_detections", ["level"])
        _emit_create_index("idx_soulwatch_detections_created", "_soulwatch_detections", ["created_at"])
        _emit_create_index("idx_soulwatch_detections_soulkey", "_soulwatch_detections", ["soulkey_id"])

    # ── _soulwatch_quarantines ───────────────────────────────────────────
    # Quarantine records with release workflow. No later schema deltas.
    if not _has_table("_soulwatch_quarantines"):
        _emit_create_table(
            "_soulwatch_quarantines",
            sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
            sa.Column("soulkey_id", sa.Uuid(), nullable=False),
            sa.Column("tenant_id", sa.Uuid(), nullable=True),
            sa.Column("persona_id", sa.Text(), nullable=True),
            sa.Column("triggered_by_type", sa.String(length=50), nullable=False),
            sa.Column("triggered_by_id", sa.Text(), nullable=True),
            sa.Column("actions_taken", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="active"),
            sa.Column("reason", sa.Text(), nullable=False, server_default=""),
            sa.Column("quarantined_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("auto_release_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("released_by", sa.Text(), nullable=True),
            sa.Column("approved_by", sa.Text(), nullable=True),
            sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        )
        _emit_create_index("idx_soulwatch_quarantines_soulkey", "_soulwatch_quarantines", ["soulkey_id"])
        _emit_create_index("idx_soulwatch_quarantines_status", "_soulwatch_quarantines", ["status"])
        _emit_create_index("idx_soulwatch_quarantines_tenant", "_soulwatch_quarantines", ["tenant_id"])

    # ── _soulwatch_dlq ───────────────────────────────────────────────────
    # Dead letter queue for failed SIEM forwarding. No later schema deltas.
    if not _has_table("_soulwatch_dlq"):
        _emit_create_table(
            "_soulwatch_dlq",
            sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
            sa.Column("event_data", sa.JSON(), nullable=False),
            sa.Column("destination", sa.String(length=100), nullable=False),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_retries", sa.Integer(), nullable=False, server_default="5"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_retry_at", sa.DateTime(timezone=True), nullable=True),
        )
        _emit_create_index("idx_soulwatch_dlq_destination", "_soulwatch_dlq", ["destination"])
        _emit_create_index("idx_soulwatch_dlq_created", "_soulwatch_dlq", ["created_at"])

    # ── _soulwatch_custom_rules ──────────────────────────────────────────
    # Per-tenant custom Sigma rules. No later schema deltas.
    if not _has_table("_soulwatch_custom_rules"):
        _emit_create_table(
            "_soulwatch_custom_rules",
            sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
            sa.Column("tenant_id", sa.Uuid(), nullable=True),
            sa.Column("rule_id", sa.String(length=255), nullable=False, unique=True),
            sa.Column("title", sa.Text(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("yaml_content", sa.Text(), nullable=False),
            sa.Column("level", sa.String(length=30), nullable=False, server_default="medium"),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_by", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        _emit_create_index("idx_soulwatch_custom_rules_tenant", "_soulwatch_custom_rules", ["tenant_id"])
        _emit_create_index("idx_soulwatch_custom_rules_rule_id", "_soulwatch_custom_rules", ["rule_id"])


def downgrade() -> None:
    op.drop_table("_soulwatch_custom_rules")
    op.drop_table("_soulwatch_dlq")
    op.drop_table("_soulwatch_quarantines")
    op.drop_table("_soulwatch_detections")
    op.drop_table("_soulwatch_anomalies")
    op.drop_table("_soulwatch_baselines")
