"""Wave H.2.e — _tenant_provider_keys table (per-tenant BYOK provider creds).

Each tenant can override the platform-default LLM provider API keys
(``ANTHROPIC_API_KEY``, ``OPENAI_API_KEY``, …) by registering their own
credential via a ``platform_secrets`` URI reference (``env://VAR_NAME``
for now; ``vault://``, ``gcpsm://``, ``awssm://`` are reserved schemes
that will be wired up by the canonical resolver in a later wave).

Schema:

    _tenant_provider_keys
        id           UUID PK
        tenant_id    UUID NOT NULL FK → _soul_tenants.id (always tenant-scoped;
                       these are credentials so global rows are explicitly
                       disallowed — there is no "platform-default" row, that
                       lives in process env)
        provider     TEXT NOT NULL (anthropic | openai | gemini | groq | ollama)
        secret_ref   TEXT NOT NULL (platform_secrets URI;
                       e.g. ``env://MY_TENANT_ANTHROPIC_KEY``)
        base_url     TEXT NULL (optional override — Ollama base, Azure OpenAI
                       endpoint, custom inference URL)
        status       TEXT NOT NULL DEFAULT 'active' (active | disabled)
        metadata_    JSONB / JSON
        created_at, updated_at, created_by

Constraints:
    * UNIQUE(tenant_id, provider) — one row per (tenant, provider). The
      provider IS the natural key per tenant; upserts replace the row.
    * Index on tenant_id for list queries.
    * CHECK status IN ('active', 'disabled').

Locked decisions (see HANDOFF_pantheon_agents_providers_routing_2026-05-17.md):
    5. Per-tenant provider keys use ``platform_secrets`` URI refs — no
       plaintext columns. The existing :mod:`src.agents.secret_ref`
       module (H.2.b) is the temporary resolver until the canonical
       ``platform_secrets`` module lands.

Portability:
    Follows the same idempotent ``_has_table`` / ``_has_column`` /
    dialect-dispatch pattern as 0039/0040/0041. Offline-renderable for
    Postgres-prod deploys; SQLite-friendly for the test harness.

Revision ID: 0042
Revises: 0041
Create Date: 2026-05-17
"""
from typing import Any, Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable

# revision identifiers
revision: str = "0042"
down_revision: str = "0041"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_offline() -> bool:
    from alembic import context as _ctx
    return _ctx.is_offline_mode()


def _is_postgres() -> bool:
    if _is_offline():
        from alembic import context as _ctx
        url = _ctx.config.get_main_option("sqlalchemy.url") or ""
        return url.startswith("postgresql")
    return op.get_bind().dialect.name == "postgresql"


def _has_table(name: str) -> bool:
    if _is_offline():
        return False
    return inspect(op.get_bind()).has_table(name)


def _jsonb_or_json() -> Any:
    return postgresql.JSONB if _is_postgres() else sa.JSON


# Module-level MetaData for offline DDL rendering. Pre-register the
# `_soul_tenants` placeholder so the FK resolves without
# NoReferencedTableError when alembic is run with --sql.
_offline_meta: sa.MetaData = sa.MetaData()
sa.Table(
    "_soul_tenants",
    _offline_meta,
    sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
)


def _emit_create_table(name: str, *columns: Any, **kwargs: Any) -> None:
    if _is_offline():
        table = sa.Table(name, _offline_meta, *columns, **kwargs)
        op.execute(CreateTable(table, if_not_exists=True))
    else:
        op.create_table(name, *columns, **kwargs)


def _emit_create_index(
    index_name: str,
    table_name: str,
    columns: Sequence[str],
    **kwargs: Any,
) -> None:
    if _is_offline():
        meta = sa.MetaData()
        cols = [sa.Column(c, sa.Text()) for c in columns]
        table = sa.Table(table_name, meta, *cols)
        idx = sa.Index(index_name, *[table.c[c] for c in columns], **kwargs)
        op.execute(CreateIndex(idx, if_not_exists=True))
    else:
        op.create_index(index_name, table_name, list(columns), **kwargs)


def upgrade() -> None:
    json_type = _jsonb_or_json()

    if not _has_table("_tenant_provider_keys"):
        _emit_create_table(
            "_tenant_provider_keys",
            sa.Column(
                "id",
                postgresql.UUID(as_uuid=False) if _is_postgres() else sa.Uuid(),
                primary_key=True,
                nullable=False,
                server_default=(
                    sa.text("gen_random_uuid()") if _is_postgres() else None
                ),
            ),
            sa.Column(
                "tenant_id",
                postgresql.UUID(as_uuid=False) if _is_postgres() else sa.Uuid(),
                sa.ForeignKey("_soul_tenants.id", ondelete="CASCADE"),
                nullable=False,
                comment="Always tenant-scoped — no global rows (these are credentials)",
            ),
            sa.Column(
                "provider",
                sa.Text(),
                nullable=False,
                comment="anthropic | openai | gemini | groq | ollama",
            ),
            sa.Column(
                "secret_ref",
                sa.Text(),
                nullable=False,
                comment="platform_secrets URI, e.g. env://MY_ANTHROPIC_KEY",
            ),
            sa.Column(
                "base_url",
                sa.Text(),
                nullable=True,
                comment="Optional provider base URL override (Azure endpoint, "
                        "Ollama host, custom inference URL)",
            ),
            sa.Column(
                "status",
                sa.String(length=20),
                nullable=False,
                server_default="active",
            ),
            sa.Column(
                "metadata_",
                json_type,
                nullable=True,
                server_default=sa.text("'{}'::jsonb") if _is_postgres() else None,
            ),
            sa.Column(
                "created_at",
                sa.TIMESTAMP(timezone=True),
                nullable=True,
                server_default=sa.text("now()") if _is_postgres() else None,
            ),
            sa.Column(
                "updated_at",
                sa.TIMESTAMP(timezone=True),
                nullable=True,
                server_default=sa.text("now()") if _is_postgres() else None,
            ),
            sa.Column(
                "created_by",
                postgresql.UUID(as_uuid=False) if _is_postgres() else sa.Uuid(),
                nullable=True,
            ),
            sa.UniqueConstraint(
                "tenant_id",
                "provider",
                name="uq_tenant_provider_keys_tenant_provider",
            ),
            sa.CheckConstraint(
                "status IN ('active', 'disabled')",
                name="ck_tenant_provider_keys_status",
            ),
        )
        _emit_create_index(
            "idx_tenant_provider_keys_tenant",
            "_tenant_provider_keys",
            ["tenant_id"],
        )


def downgrade() -> None:
    if _has_table("_tenant_provider_keys"):
        op.drop_table("_tenant_provider_keys")
