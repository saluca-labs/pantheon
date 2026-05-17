"""Wave H.2.a — _agos_agents + _agos_prompts + soulkeys.agent_id (+backfill).

DB foundation for first-class agents and DB-canonical prompts.

Tables created (in dependency order — prompts FIRST because agents.prompt_id
references it):

    _agos_prompts
        Append-only versioned prompt store. ``supersedes_id`` chains old
        versions; one ``status='active'`` row per ``(tenant_id, name)`` at a
        time. Plain text only — no {{var}} templating. ``tenant_id`` is
        nullable for global / marketplace templates.

    _agos_agents
        First-class agent row: key + persona + prompt. Routing/model
        preferences are intentionally NOT stored here (model-independent per
        locked decision #9; routing stays in the persona policy YAML).
        ``tenant_id`` is nullable so the same shape supports global agents.
        Unique on ``(tenant_id, persona_id)``.

Column added:

    _soulkeys.agent_id  (nullable UUID FK -> _agos_agents.id)
        Optional back-link from a SoulKey credential to its owning Agos
        agent row. Old SoulKeys keep NULL until backfilled.

Backfill performed:

    For every distinct (tenant_id, persona_id) tuple in _soulkeys that does
    not already have a matching _agos_agents row, insert one with:
        name        = persona_id   (placeholder; UI rename in H.2.f)
        description = NULL
        status      = 'active'
        metadata_   = '{}'
        prompt_id   = NULL         (prompts seeded separately by H.2.b)
    Then UPDATE _soulkeys SET agent_id = (the new agent.id) WHERE the row's
    (tenant_id, persona_id) matches. Global agents (tenant_id IS NULL) are
    NOT created in this migration — that's part of the marketplace work.

Locked decisions (see HANDOFF_pantheon_agents_providers_routing_2026-05-17.md):
    1. Agents are configurable but start GLOBAL — but the first backfill is
       per-tenant; global templates land in a later marketplace pass.
    2. persona_id is the natural key — no opaque agent_uuid in the wire
       model. The UUID PK on _agos_agents exists for FK joins only.
    3. Prompts are DB-canonical (append-only + supersedes chain).
    4. Plain text prompts (no templating).
    9. Agent is model-independent.

Notes on portability:
  * ``_emit_*`` helpers mirror the 0028a soulwatch migration pattern so
    `alembic upgrade --sql` against a populated DB no-ops on existing
    objects instead of crashing mid-transaction.
  * JSONB on Postgres, JSON elsewhere — dialect-dispatched.
  * Partial unique index for global agents (tenant_id IS NULL) is
    Postgres-only; emitted via raw SQL guarded on dialect.

Revision ID: 0039
Revises: 0038
Create Date: 2026-05-17
"""
from typing import Any, Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable

# revision identifiers
revision: str = "0039"
down_revision: str = "0038"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_offline() -> bool:
    from alembic import context as _ctx
    return _ctx.is_offline_mode()


def _is_postgres() -> bool:
    if _is_offline():
        # Alembic's offline mode picks a dialect from the URL; default to
        # postgres if no bind is available (production migration target).
        from alembic import context as _ctx
        url = _ctx.config.get_main_option("sqlalchemy.url") or ""
        return url.startswith("postgresql")
    return op.get_bind().dialect.name == "postgresql"


def _has_table(name: str) -> bool:
    if _is_offline():
        return False
    return inspect(op.get_bind()).has_table(name)


def _has_column(table: str, column: str) -> bool:
    if _is_offline():
        return False
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return False
    return any(c["name"] == column for c in insp.get_columns(table))


def _jsonb_or_json() -> Any:
    """Return JSONB on Postgres, JSON elsewhere."""
    return postgresql.JSONB if _is_postgres() else sa.JSON


# Module-level MetaData for offline DDL rendering. Shared across helper calls
# so cross-table FKs (e.g. _agos_agents.prompt_id -> _agos_prompts.id) resolve
# without SA NoReferencedTableError. We also pre-register placeholder shells
# for parent tables this migration references but does not own (_soul_tenants).
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

    # ── 1. _agos_prompts ────────────────────────────────────────────────
    # Created FIRST because _agos_agents.prompt_id references it.
    if not _has_table("_agos_prompts"):
        _emit_create_table(
            "_agos_prompts",
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
                nullable=True,
                comment="NULL = global / marketplace template",
            ),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column(
                "supersedes_id",
                postgresql.UUID(as_uuid=False) if _is_postgres() else sa.Uuid(),
                sa.ForeignKey("_agos_prompts.id", ondelete="SET NULL"),
                nullable=True,
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
                "created_by",
                postgresql.UUID(as_uuid=False) if _is_postgres() else sa.Uuid(),
                nullable=True,
            ),
            sa.CheckConstraint(
                "status IN ('draft', 'active', 'deprecated')",
                name="ck_agos_prompts_status",
            ),
        )
        _emit_create_index(
            "idx_agos_prompts_tenant_name", "_agos_prompts", ["tenant_id", "name"]
        )
        _emit_create_index("idx_agos_prompts_name", "_agos_prompts", ["name"])
        _emit_create_index(
            "idx_agos_prompts_supersedes", "_agos_prompts", ["supersedes_id"]
        )

    # ── 2. _agos_agents ─────────────────────────────────────────────────
    if not _has_table("_agos_agents"):
        _emit_create_table(
            "_agos_agents",
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
                nullable=True,
                comment="NULL = global / marketplace template",
            ),
            sa.Column(
                "persona_id",
                sa.Text(),
                nullable=False,
                comment="Natural key; links to _soulkeys.persona_id (no FK)",
            ),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column(
                "prompt_id",
                postgresql.UUID(as_uuid=False) if _is_postgres() else sa.Uuid(),
                sa.ForeignKey("_agos_prompts.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "metadata_",
                json_type,
                nullable=True,
                server_default=sa.text("'{}'::jsonb") if _is_postgres() else None,
            ),
            sa.Column(
                "status",
                sa.String(length=20),
                nullable=False,
                server_default="active",
            ),
            sa.Column(
                "created_at",
                sa.TIMESTAMP(timezone=True),
                nullable=True,
                server_default=sa.text("now()") if _is_postgres() else None,
            ),
            sa.Column(
                "created_by",
                postgresql.UUID(as_uuid=False) if _is_postgres() else sa.Uuid(),
                nullable=True,
            ),
            sa.Column(
                "updated_at",
                sa.TIMESTAMP(timezone=True),
                nullable=True,
                server_default=sa.text("now()") if _is_postgres() else None,
            ),
            sa.UniqueConstraint(
                "tenant_id", "persona_id", name="uq_agos_agents_tenant_persona"
            ),
            sa.CheckConstraint(
                "status IN ('active', 'draft', 'archived')",
                name="ck_agos_agents_status",
            ),
        )
        _emit_create_index("idx_agos_agents_tenant", "_agos_agents", ["tenant_id"])
        _emit_create_index("idx_agos_agents_persona", "_agos_agents", ["persona_id"])
        _emit_create_index("idx_agos_agents_prompt", "_agos_agents", ["prompt_id"])

        # Partial unique index for global agents — Postgres treats NULL as
        # distinct in UNIQUE constraints, so the regular constraint above
        # cannot enforce uniqueness on (NULL, persona_id). Postgres-only.
        if _is_postgres():
            op.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_agos_agents_global_persona
                    ON _agos_agents (persona_id)
                    WHERE tenant_id IS NULL;
                """
            )

    # ── 3. _soulkeys.agent_id ───────────────────────────────────────────
    # Add the column first WITHOUT an inline FK so SQLite (used by the test
    # harness) does not blow up — ALTER TABLE ADD COLUMN with a REFERENCES
    # clause requires batch mode on SQLite. The FK is added separately on
    # Postgres below; on SQLite the constraint is not enforced (tests
    # don't depend on it).
    if not _has_column("_soulkeys", "agent_id"):
        op.add_column(
            "_soulkeys",
            sa.Column(
                "agent_id",
                postgresql.UUID(as_uuid=False) if _is_postgres() else sa.Uuid(),
                nullable=True,
            ),
        )
        _emit_create_index("idx_soulkeys_agent_id", "_soulkeys", ["agent_id"])
        if _is_postgres():
            op.create_foreign_key(
                "fk_soulkeys_agent_id",
                "_soulkeys",
                "_agos_agents",
                ["agent_id"],
                ["id"],
            )

    # ── 4. Backfill: 1 agent per distinct (tenant_id, persona_id) ──────
    # Skip when offline (the migration is being rendered to SQL; the
    # operator can run the backfill SQL block separately if needed).
    if _is_offline():
        # Emit the backfill statements as raw SQL so they show up in the
        # generated script. Postgres-only syntax (gen_random_uuid()) —
        # acceptable because offline mode is for prod-style targets.
        op.execute(
            """
            INSERT INTO _agos_agents (
                id, tenant_id, persona_id, name, description,
                prompt_id, metadata_, status, created_at, updated_at
            )
            SELECT
                gen_random_uuid()              AS id,
                sk.tenant_id                   AS tenant_id,
                sk.persona_id                  AS persona_id,
                sk.persona_id                  AS name,
                NULL                           AS description,
                NULL                           AS prompt_id,
                '{}'::jsonb                    AS metadata_,
                'active'                       AS status,
                now()                          AS created_at,
                now()                          AS updated_at
            FROM (
                SELECT DISTINCT tenant_id, persona_id
                FROM _soulkeys
                WHERE persona_id IS NOT NULL
            ) sk
            WHERE NOT EXISTS (
                SELECT 1 FROM _agos_agents a
                WHERE a.tenant_id IS NOT DISTINCT FROM sk.tenant_id
                  AND a.persona_id = sk.persona_id
            );
            """
        )
        op.execute(
            """
            UPDATE _soulkeys sk
               SET agent_id = a.id
              FROM _agos_agents a
             WHERE sk.agent_id IS NULL
               AND a.tenant_id IS NOT DISTINCT FROM sk.tenant_id
               AND a.persona_id = sk.persona_id;
            """
        )
        return

    # Online path: introspect the bind so backfill works on Postgres AND
    # on the SQLite test harness (gen_random_uuid is Postgres-only, JSONB
    # literal cast is Postgres-only).
    bind = op.get_bind()

    if _is_postgres():
        bind.execute(
            sa.text(
                """
                INSERT INTO _agos_agents (
                    id, tenant_id, persona_id, name, description,
                    prompt_id, metadata_, status, created_at, updated_at
                )
                SELECT
                    gen_random_uuid()              AS id,
                    sk.tenant_id                   AS tenant_id,
                    sk.persona_id                  AS persona_id,
                    sk.persona_id                  AS name,
                    NULL                           AS description,
                    NULL                           AS prompt_id,
                    '{}'::jsonb                    AS metadata_,
                    'active'                       AS status,
                    now()                          AS created_at,
                    now()                          AS updated_at
                FROM (
                    SELECT DISTINCT tenant_id, persona_id
                    FROM _soulkeys
                    WHERE persona_id IS NOT NULL
                ) sk
                WHERE NOT EXISTS (
                    SELECT 1 FROM _agos_agents a
                    WHERE a.tenant_id IS NOT DISTINCT FROM sk.tenant_id
                      AND a.persona_id = sk.persona_id
                );
                """
            )
        )
        bind.execute(
            sa.text(
                """
                UPDATE _soulkeys
                   SET agent_id = a.id
                  FROM _agos_agents a
                 WHERE _soulkeys.agent_id IS NULL
                   AND a.tenant_id IS NOT DISTINCT FROM _soulkeys.tenant_id
                   AND a.persona_id = _soulkeys.persona_id;
                """
            )
        )
    else:
        # SQLite (and other non-Postgres) backfill: portable Python loop.
        # Used by the test harness; production uses the Postgres path above.
        import uuid as _uuid
        from datetime import datetime as _dt, timezone as _tz

        rows = bind.execute(
            sa.text(
                "SELECT DISTINCT tenant_id, persona_id FROM _soulkeys "
                "WHERE persona_id IS NOT NULL"
            )
        ).fetchall()
        for tenant_id, persona_id in rows:
            existing = bind.execute(
                sa.text(
                    "SELECT id FROM _agos_agents "
                    "WHERE tenant_id = :tid AND persona_id = :pid"
                ),
                {"tid": tenant_id, "pid": persona_id},
            ).fetchone()
            if existing is not None:
                agent_id = existing[0]
            else:
                agent_id = str(_uuid.uuid4())
                now = _dt.now(_tz.utc)
                bind.execute(
                    sa.text(
                        "INSERT INTO _agos_agents "
                        "(id, tenant_id, persona_id, name, description, "
                        " prompt_id, metadata_, status, created_at, updated_at) "
                        "VALUES (:id, :tid, :pid, :name, NULL, NULL, '{}', "
                        " 'active', :now, :now)"
                    ),
                    {
                        "id": agent_id,
                        "tid": tenant_id,
                        "pid": persona_id,
                        "name": persona_id,
                        "now": now,
                    },
                )
            bind.execute(
                sa.text(
                    "UPDATE _soulkeys SET agent_id = :aid "
                    "WHERE tenant_id = :tid AND persona_id = :pid "
                    "AND agent_id IS NULL"
                ),
                {"aid": agent_id, "tid": tenant_id, "pid": persona_id},
            )


def downgrade() -> None:
    # Reverse order: drop FK column from _soulkeys, then agents, then prompts.
    # Indexes drop with the table on Postgres; explicit drop for soulkeys idx.
    if _has_column("_soulkeys", "agent_id"):
        if _is_postgres():
            try:
                op.drop_constraint(
                    "fk_soulkeys_agent_id", "_soulkeys", type_="foreignkey"
                )
            except Exception:
                pass
        try:
            op.drop_index("idx_soulkeys_agent_id", table_name="_soulkeys")
        except Exception:
            # Index may have already been dropped or never created on a
            # partial-failure rollback. Continue with column drop.
            pass
        op.drop_column("_soulkeys", "agent_id")

    if _has_table("_agos_agents"):
        if _is_postgres():
            op.execute("DROP INDEX IF EXISTS uq_agos_agents_global_persona;")
        op.drop_table("_agos_agents")

    if _has_table("_agos_prompts"):
        op.drop_table("_agos_prompts")
