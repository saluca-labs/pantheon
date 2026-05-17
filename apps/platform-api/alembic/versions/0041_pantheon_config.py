"""Wave H.2.b — _pantheon_config k/v table.

Process-wide configuration store for pantheon-platform-api. Lives in the
main pantheon Postgres regardless of where the agents-store data lives
(local-in-container PG or Supabase) — config selection happens BEFORE
the agents-store is constructed, so it can't depend on it.

Schema:

    _pantheon_config
        key         TEXT PRIMARY KEY
        value       JSONB (Postgres) / JSON (SQLite)
        updated_at  TIMESTAMP WITH TIME ZONE  default now(), refreshed on update

Seeded keys (W-H.2.b):

    agents_store.kind     = "local"   (LocalPg default)
    agents_store.config   = {}        (empty until Supabase configured)

When kind = "supabase", the config payload looks like:

    {
        "url": "https://xxxxx.supabase.co",
        "service_role_key_ref": "env://SUPABASE_SERVICE_ROLE_KEY"
    }

The `service_role_key_ref` is resolved via the minimal env:// resolver in
``src.agents.secret_ref`` for this ship; the future `platform_secrets`
module will own the broader scheme set (vault://, gcpsm://, …).

Locked decisions:
  * #5 — secret-refs only; raw keys never stored in the config row.

Revision ID: 0041
Revises: 0040
Create Date: 2026-05-17
"""
from typing import Any, Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

# revision identifiers
revision: str = "0041"
down_revision: str = "0040"
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


# Module-level metadata for offline DDL rendering — mirrors the 0039 pattern
# so cross-table refs (if any) compile without NoReferencedTableError.
_offline_meta: sa.MetaData = sa.MetaData()


def _emit_create_table(name: str, *columns: Any, **kwargs: Any) -> None:
    if _is_offline():
        table = sa.Table(name, _offline_meta, *columns, **kwargs)
        op.execute(CreateTable(table, if_not_exists=True))
    else:
        op.create_table(name, *columns, **kwargs)


def upgrade() -> None:
    json_type = _jsonb_or_json()

    if not _has_table("_pantheon_config"):
        _emit_create_table(
            "_pantheon_config",
            sa.Column("key", sa.Text(), primary_key=True, nullable=False),
            sa.Column("value", json_type, nullable=False),
            sa.Column(
                "updated_at",
                sa.TIMESTAMP(timezone=True),
                nullable=False,
                server_default=sa.text("now()") if _is_postgres() else sa.text("CURRENT_TIMESTAMP"),
            ),
        )

    # ── Seed defaults ──────────────────────────────────────────────────
    # Use INSERT … ON CONFLICT DO NOTHING (Postgres) / INSERT OR IGNORE
    # (SQLite) so re-running on an already-seeded DB is a no-op and
    # operators who have set kind='supabase' don't get reset back to 'local'.

    if _is_offline():
        op.execute(
            """
            INSERT INTO _pantheon_config (key, value, updated_at)
                 VALUES ('agents_store.kind', '"local"'::jsonb, now())
            ON CONFLICT (key) DO NOTHING;
            """
        )
        op.execute(
            """
            INSERT INTO _pantheon_config (key, value, updated_at)
                 VALUES ('agents_store.config', '{}'::jsonb, now())
            ON CONFLICT (key) DO NOTHING;
            """
        )
        return

    bind = op.get_bind()
    if _is_postgres():
        bind.execute(
            sa.text(
                "INSERT INTO _pantheon_config (key, value, updated_at) "
                "VALUES ('agents_store.kind', '\"local\"'::jsonb, now()) "
                "ON CONFLICT (key) DO NOTHING"
            )
        )
        bind.execute(
            sa.text(
                "INSERT INTO _pantheon_config (key, value, updated_at) "
                "VALUES ('agents_store.config', '{}'::jsonb, now()) "
                "ON CONFLICT (key) DO NOTHING"
            )
        )
    else:
        # SQLite stores JSON columns as TEXT; bind as JSON string literals.
        # INSERT OR IGNORE matches "ON CONFLICT DO NOTHING" semantics.
        bind.execute(
            sa.text(
                "INSERT OR IGNORE INTO _pantheon_config (key, value, updated_at) "
                "VALUES ('agents_store.kind', :v, CURRENT_TIMESTAMP)"
            ),
            {"v": '"local"'},
        )
        bind.execute(
            sa.text(
                "INSERT OR IGNORE INTO _pantheon_config (key, value, updated_at) "
                "VALUES ('agents_store.config', :v, CURRENT_TIMESTAMP)"
            ),
            {"v": "{}"},
        )


def downgrade() -> None:
    if _has_table("_pantheon_config"):
        op.drop_table("_pantheon_config")
