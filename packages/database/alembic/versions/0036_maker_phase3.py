"""Maker OS Phase 3 — build steps + build log + milestones.

Revision ID: 0036_maker_phase3
Revises: 0035_maker_phase2
Create Date: 2026-05-11

Phase 3 makes a Maker project walkable: an ordered build-step checklist, a
timestamped log of notes/photos/links, and a milestone strip. The shape is
locked by ``apps/platform-web/content/agentic-os/maker.md`` (Phase 3 section)
and the per-task spec in the v0.1.32 build prompt.

New tables (all under ``agos_maker_*``)::

    agos_maker_build_steps        -- ordered checklist of build steps
    agos_maker_build_log_entries  -- timestamped feed of notes/photos/links
    agos_maker_build_milestones   -- Gantt-style milestone strip

URL columns
-----------
The ``attached_urls`` JSONB column on ``agos_maker_build_log_entries`` holds an
array of ``{url, kind, label}`` objects where ``kind`` is one of
``photo|video|link|file``. Asset upload remains URL-only — see
``docs/architecture/mcp-storage-transfer.md`` for the eventual MCP-mediated
storage pathway.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``, ``CREATE INDEX IF NOT
EXISTS``). The downgrade drops indexes + tables in dependency order; the new
tables have no legacy precursor, so a straight ``DROP TABLE IF EXISTS`` is
sufficient.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0036_maker_phase3"
down_revision: Union[str, None] = "0035_maker_phase2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. agos_maker_build_steps -----------------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_build_steps (
    id            UUID        PRIMARY KEY,
    project_id    UUID        NOT NULL
                              REFERENCES agos_maker_projects(id)
                              ON DELETE CASCADE,
    ordinal       INT         NOT NULL,
    title         TEXT        NOT NULL,
    body          TEXT        NULL,
    est_minutes   INT         NULL,
    completed_at  TIMESTAMPTZ NULL,
    blocker_text  TEXT        NULL,
    metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_maker_build_steps_project_ordinal_idx
    ON agos_maker_build_steps (project_id, ordinal);

COMMENT ON COLUMN agos_maker_build_steps.completed_at IS
  'NULL while pending; set to now() on first completion. The /complete route toggles this idempotently (NULL -> now() and now() -> NULL via ?undo=true).';

COMMENT ON COLUMN agos_maker_build_steps.blocker_text IS
  'Free-form note describing a blocker. Plain text — the UI surfaces this on the step row when set.';

-- 2. agos_maker_build_log_entries -----------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_build_log_entries (
    id             UUID        PRIMARY KEY,
    project_id     UUID        NOT NULL
                               REFERENCES agos_maker_projects(id)
                               ON DELETE CASCADE,
    step_id        UUID        NULL
                               REFERENCES agos_maker_build_steps(id)
                               ON DELETE SET NULL,
    body           TEXT        NOT NULL,
    attached_urls  JSONB       NOT NULL DEFAULT '[]'::jsonb,
    author_id      UUID        NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_maker_build_log_entries_project_created_idx
    ON agos_maker_build_log_entries (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agos_maker_build_log_entries_step_idx
    ON agos_maker_build_log_entries (step_id)
    WHERE step_id IS NOT NULL;

COMMENT ON COLUMN agos_maker_build_log_entries.attached_urls IS
  'Array of {url, kind, label} objects, kind in (photo|video|link|file). External URL only — asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_maker_build_log_entries.author_id IS
  'Set by the route handler from the current session user on insert. Nullable to allow system-generated entries.';

-- 3. agos_maker_build_milestones ------------------------------------------

CREATE TABLE IF NOT EXISTS agos_maker_build_milestones (
    id            UUID        PRIMARY KEY,
    project_id    UUID        NOT NULL
                              REFERENCES agos_maker_projects(id)
                              ON DELETE CASCADE,
    label         TEXT        NOT NULL,
    due_at        DATE        NULL,
    completed_at  TIMESTAMPTZ NULL,
    sort_order    INT         NOT NULL DEFAULT 0,
    notes         TEXT        NULL,
    metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_maker_build_milestones_project_sort_idx
    ON agos_maker_build_milestones (project_id, sort_order);

COMMENT ON COLUMN agos_maker_build_milestones.completed_at IS
  'NULL while pending; toggle via /complete route. UI orders the strip by due_at ASC NULLS LAST, sort_order ASC.';

COMMENT ON COLUMN agos_maker_build_milestones.due_at IS
  'Target date for the milestone, calendar date (no time-of-day). NULL means undated; the UI falls back to sort_order in that case.';
"""


_DOWNGRADE_SQL = r"""
-- New tables only — no legacy precursor. Drop indexes (they implicitly drop
-- with the table on Postgres, but listing for clarity) then tables in
-- reverse dependency order: log_entries depends on build_steps (step_id FK
-- with SET NULL); milestones + steps are independent siblings on project.

DROP INDEX IF EXISTS agos_maker_build_log_entries_step_idx;
DROP INDEX IF EXISTS agos_maker_build_log_entries_project_created_idx;
DROP INDEX IF EXISTS agos_maker_build_milestones_project_sort_idx;
DROP INDEX IF EXISTS agos_maker_build_steps_project_ordinal_idx;

DROP TABLE IF EXISTS agos_maker_build_log_entries;
DROP TABLE IF EXISTS agos_maker_build_milestones;
DROP TABLE IF EXISTS agos_maker_build_steps;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
