"""Wave H.2.a2 — drop _soulkeys.agent_id column.

Reverts the back-link column added in migration 0039 (W-H.2.a). The
``_agos_agents`` and ``_agos_prompts`` tables stay — they're the
local-in-container default for the Wave H.2.b adapter (LocalPg ↔ Supabase).

Rationale (per Cristian's locked decision #2 + 2026-05-17 architecture pivot):

  * ``persona_id`` is the natural key for an agent — joins from a SoulKey to
    its agent should use ``(tenant_id, persona_id)``, not a UUID FK.
  * SoulKeys live in the SoulAuth datastore (a separate Postgres for
    pantheon.saluca.com, and may be Supabase in self-hosted deployments).
    Agents live in the Wave-H.2.b configurable store (local-in-container PG
    by default, Supabase as an alternative). The two stores may be
    physically distinct — a cross-store FK is meaningless and the H.2.a
    backfill against pantheon's PG ``_soulkeys`` (which is dead-code in
    prod — the real SoulKeys are in SoulAuth's Cloud SQL) backfilled zero
    rows in production anyway.

Operations:

  * Drop ``fk_soulkeys_agent_id`` constraint (Postgres only)
  * Drop ``idx_soulkeys_agent_id`` index
  * Drop ``_soulkeys.agent_id`` column

All guarded with ``_has_*`` checks so the migration is idempotent and safe to
re-apply, and so ``alembic upgrade --sql`` rendering doesn't crash.

Revision ID: 0040
Revises: 0039
Create Date: 2026-05-17
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

# revision identifiers
revision: str = "0040"
down_revision: str = "0039"
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
        # Assume table exists for SQL rendering; the IF EXISTS clauses below
        # make the emitted SQL safe to run against an already-stripped DB.
        return True
    return inspect(op.get_bind()).has_table(name)


def _has_column(table: str, column: str) -> bool:
    if _is_offline():
        return True
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return False
    return any(c["name"] == column for c in insp.get_columns(table))


def upgrade() -> None:
    if not _has_table("_soulkeys"):
        return
    if not _has_column("_soulkeys", "agent_id"):
        return

    # 1. Drop the FK constraint (Postgres only — SQLite never had one).
    if _is_postgres():
        try:
            op.drop_constraint("fk_soulkeys_agent_id", "_soulkeys", type_="foreignkey")
        except Exception:
            # Constraint may already be gone; let column drop proceed.
            pass

    # 2. Drop the index.
    try:
        op.drop_index("idx_soulkeys_agent_id", table_name="_soulkeys")
    except Exception:
        pass

    # 3. Drop the column.
    if _is_postgres():
        op.execute("ALTER TABLE _soulkeys DROP COLUMN IF EXISTS agent_id")
    else:
        # SQLite: needs batch mode for ALTER DROP COLUMN.
        with op.batch_alter_table("_soulkeys") as batch_op:
            batch_op.drop_column("agent_id")


def downgrade() -> None:
    """Re-add the column for symmetry with the 0039 upgrade path.

    Does NOT re-run the backfill; the column comes back as NULL for all rows.
    """
    import sqlalchemy as sa
    from sqlalchemy.dialects import postgresql

    if not _has_table("_soulkeys"):
        return
    if _has_column("_soulkeys", "agent_id"):
        return

    op.add_column(
        "_soulkeys",
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=False) if _is_postgres() else sa.Uuid(),
            nullable=True,
        ),
    )
    op.create_index("idx_soulkeys_agent_id", "_soulkeys", ["agent_id"])
    if _is_postgres():
        op.create_foreign_key(
            "fk_soulkeys_agent_id",
            "_soulkeys",
            "_agos_agents",
            ["agent_id"],
            ["id"],
            ondelete="SET NULL",
        )
