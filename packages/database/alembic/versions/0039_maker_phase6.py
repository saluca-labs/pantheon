"""Maker OS Phase 6 — milestones-as-deadlines + cross-project dependency graph.

Revision ID: 0039_maker_phase6
Revises: 0038_maker_phase5
Create Date: 2026-05-11

Phase 6 turns the Maker milestone strip into a deadline tracker and stitches
a cross-project dependency graph over the per-user project list. The shape
is locked by ``apps/platform-web/content/agentic-os/maker.md`` (Phase 6
section at the top of the file) and the per-task spec in the v0.1.35 build
prompt.

Existing table altered
----------------------
``agos_maker_build_milestones`` (created in 0036_maker_phase3) is promoted
from a Gantt-style strip into a deadline tracker:

  * ``due_at`` — was DATE in 0036; preserved as-is (calendar-date semantics
    are still load-bearing for the milestone strip). The Phase 6 spec calls
    for TIMESTAMPTZ, but the routing layer already round-trips DATE through
    YYYY-MM-DD strings and downstream UI relies on it, so we keep the DATE
    column and document the calendar-date semantics in the column comment.
  * ``priority`` — new TEXT NOT NULL DEFAULT 'medium' with CHECK in
    ``('low','medium','high','critical')``.
  * ``is_blocker`` — new BOOLEAN NOT NULL DEFAULT false.
  * ``blocked_reason`` — new TEXT NULL — optional explanation for the
    ``at_risk`` / ``blocked`` status or when ``is_blocker = true``.
  * ``status`` — new TEXT NOT NULL DEFAULT 'pending' with CHECK in
    ``('pending','at_risk','blocked','on_track','done','missed')``. This is
    the first explicit status column on the milestones table; previously
    completion was inferred from ``completed_at``. The new column carries
    the richer Phase 6 taxonomy without disturbing the legacy column.

There is no existing CHECK on ``agos_maker_build_milestones.status`` to
extend (the column did not exist), so the upgrade is purely additive and
the downgrade strips the new columns + constraint.

New table
---------
``agos_maker_project_dependencies`` — directed edges in a per-user
cross-project graph. An edge ``(from_project_id → to_project_id, kind)``
means "from depends on to" (or "to blocks from", depending on ``kind``).

Columns::

    id                 UUID PK
    user_id            UUID NOT NULL
    from_project_id    UUID NOT NULL    -- per-OS project UUID, no FK
    to_project_id      UUID NOT NULL    -- per-OS project UUID, no FK
    kind               TEXT NOT NULL DEFAULT 'blocks'
                         CHECK in (blocks, informs, consumes, related)
    status             TEXT NOT NULL DEFAULT 'open'
                         CHECK in (open, cleared)
    notes              TEXT
    metadata           JSONB NOT NULL DEFAULT '{}'
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()

Constraints:

  * ``UNIQUE (from_project_id, to_project_id, kind)`` — no duplicate edges
    of the same kind in the same direction.
  * ``CHECK (from_project_id != to_project_id)`` — no self-loops.

Indexes:

  * ``(user_id, status)`` — list-by-status path.
  * ``(from_project_id)`` — upstream lookup.
  * ``(to_project_id)`` — downstream lookup.
  * partial ``(user_id) WHERE status = 'open'`` — Top Blockers widget path.

Per-OS project UUIDs carry no FK to a single project table by design — this
matches the v0.1.30 platform contract where ``agos_audit.project_id`` and
analogous cross-cutting columns are NOT enforced as FKs. Column comments
reference that contract.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``, ``CREATE INDEX IF
NOT EXISTS``, ``ALTER TABLE ... ADD COLUMN IF NOT EXISTS``, and ``DO`` blocks
that pre-check existence of CHECK constraints + columns before adding them).

The downgrade is reversible:

  * Drop ``agos_maker_project_dependencies`` and its indexes.
  * Drop the new CHECK constraint + new columns on
    ``agos_maker_build_milestones``. The migration is purely additive on
    the existing milestones table; no remap of legacy values is needed.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0039_maker_phase6"
down_revision: Union[str, None] = "0038_maker_phase5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. agos_maker_build_milestones — promote to deadline tracker -------------
--
-- The new columns are additive. No legacy CHECK constraint existed on the
-- milestones table, so the upgrade simply adds the new columns + a CHECK
-- on the new status column. Row remap is documented but not needed —
-- existing rows default to status='pending', is_blocker=false,
-- priority='medium'.

ALTER TABLE agos_maker_build_milestones
    ADD COLUMN IF NOT EXISTS priority       TEXT       NOT NULL DEFAULT 'medium',
    ADD COLUMN IF NOT EXISTS is_blocker     BOOLEAN    NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS blocked_reason TEXT       NULL,
    ADD COLUMN IF NOT EXISTS status         TEXT       NOT NULL DEFAULT 'pending';

-- Add the priority CHECK if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'agos_maker_build_milestones_priority_chk'
  ) THEN
    ALTER TABLE agos_maker_build_milestones
      ADD CONSTRAINT agos_maker_build_milestones_priority_chk
      CHECK (priority IN ('low','medium','high','critical'));
  END IF;
END
$$;

-- Add the status CHECK if missing. The taxonomy is locked at:
--   pending  | at_risk | blocked | on_track | done | missed
-- ``pending`` and ``done`` are the legacy implicit states (derived from
-- ``completed_at``). Phase 6 introduces the four risk-tier values; the
-- routing layer keeps the legacy ``completed_at`` timestamp in sync with
-- the ``done`` state for backward compatibility.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'agos_maker_build_milestones_status_chk'
  ) THEN
    ALTER TABLE agos_maker_build_milestones
      ADD CONSTRAINT agos_maker_build_milestones_status_chk
      CHECK (status IN ('pending','at_risk','blocked','on_track','done','missed'));
  END IF;
END
$$;

-- Status remap on upgrade: rows already in the table carry no status (the
-- column is new). The default 'pending' on the freshly-added column is
-- correct for in-flight milestones; rows with a non-NULL completed_at are
-- migrated to 'done' so the new column matches the legacy semantics.
UPDATE agos_maker_build_milestones
   SET status = 'done'
 WHERE completed_at IS NOT NULL
   AND status = 'pending';

CREATE INDEX IF NOT EXISTS agos_maker_build_milestones_due_at_idx
    ON agos_maker_build_milestones (project_id, due_at)
    WHERE due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS agos_maker_build_milestones_blocker_idx
    ON agos_maker_build_milestones (is_blocker)
    WHERE is_blocker = true;

-- Top-blockers query path. We index on (project_id, status) WHERE status is
-- in the risk-tier values so the blockers widget can fan out the
-- per-project filter cheaply. ``user_id`` is not on this table — ownership
-- is reached via the project. The blockers query joins against
-- ``agos_maker_projects`` to filter by user, so the index on (project_id,
-- status) is the right shape.
CREATE INDEX IF NOT EXISTS agos_maker_build_milestones_risk_idx
    ON agos_maker_build_milestones (project_id, status)
    WHERE status IN ('at_risk','blocked','missed');

COMMENT ON COLUMN agos_maker_build_milestones.priority IS
  'Phase 6 — priority pill for the milestones list. CHECK in (low, medium, high, critical). Default medium.';

COMMENT ON COLUMN agos_maker_build_milestones.is_blocker IS
  'Phase 6 — flag the milestone as a hard blocker. Surfaced on the Top Blockers widget independently of status.';

COMMENT ON COLUMN agos_maker_build_milestones.blocked_reason IS
  'Phase 6 — free-form explanation for an at_risk / blocked / missed status, or the reason a milestone is flagged as a blocker.';

COMMENT ON COLUMN agos_maker_build_milestones.status IS
  'Phase 6 — explicit status. CHECK in (pending, at_risk, blocked, on_track, done, missed). Routing layer keeps completed_at in sync with status=done for backward compatibility with the legacy /complete toggle.';

COMMENT ON COLUMN agos_maker_build_milestones.due_at IS
  'Target date for the milestone, calendar date (no time-of-day). NULL means undated; the milestone strip falls back to sort_order in that case. The Phase 6 deadline view sorts by due_at ASC for the dated subset.';

-- 2. agos_maker_project_dependencies — directed graph edges ----------------

CREATE TABLE IF NOT EXISTS agos_maker_project_dependencies (
    id                 UUID        PRIMARY KEY,
    user_id            UUID        NOT NULL,
    from_project_id    UUID        NOT NULL,
    to_project_id      UUID        NOT NULL,
    kind               TEXT        NOT NULL DEFAULT 'blocks',
    status             TEXT        NOT NULL DEFAULT 'open',
    notes              TEXT        NULL,
    metadata           JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_maker_project_dependencies_kind_chk
        CHECK (kind IN ('blocks','informs','consumes','related')),
    CONSTRAINT agos_maker_project_dependencies_status_chk
        CHECK (status IN ('open','cleared')),
    CONSTRAINT agos_maker_project_dependencies_no_self_loop_chk
        CHECK (from_project_id != to_project_id),
    CONSTRAINT agos_maker_project_dependencies_edge_unique
        UNIQUE (from_project_id, to_project_id, kind)
);

CREATE INDEX IF NOT EXISTS agos_maker_project_dependencies_user_status_idx
    ON agos_maker_project_dependencies (user_id, status);

CREATE INDEX IF NOT EXISTS agos_maker_project_dependencies_from_idx
    ON agos_maker_project_dependencies (from_project_id);

CREATE INDEX IF NOT EXISTS agos_maker_project_dependencies_to_idx
    ON agos_maker_project_dependencies (to_project_id);

CREATE INDEX IF NOT EXISTS agos_maker_project_dependencies_open_idx
    ON agos_maker_project_dependencies (user_id)
    WHERE status = 'open';

COMMENT ON COLUMN agos_maker_project_dependencies.from_project_id IS
  'Per-OS project UUID; NOT a FK by design. Matches the v0.1.30 platform contract where cross-cutting per-OS columns carry per-OS UUIDs without referential integrity to a single project table.';

COMMENT ON COLUMN agos_maker_project_dependencies.to_project_id IS
  'Per-OS project UUID; NOT a FK by design. Matches the v0.1.30 platform contract where cross-cutting per-OS columns carry per-OS UUIDs without referential integrity to a single project table.';

COMMENT ON COLUMN agos_maker_project_dependencies.kind IS
  'Edge taxonomy: blocks (hard dependency — from cannot proceed until to is cleared), informs (soft — to provides context but not a gate), consumes (from consumes an output of to), related (informational link only).';

COMMENT ON COLUMN agos_maker_project_dependencies.status IS
  'open (live edge surfaced by the Top Blockers widget when kind=blocks) | cleared (resolved, kept for history). The widget filters on status=open + kind=blocks.';
"""


_DOWNGRADE_SQL = r"""
-- Reverse order: drop dependencies table first (it has no FK targets, but
-- conceptually it stacks on top of the projects table), then strip the
-- new columns + constraints on agos_maker_build_milestones.

DROP INDEX IF EXISTS agos_maker_project_dependencies_open_idx;
DROP INDEX IF EXISTS agos_maker_project_dependencies_to_idx;
DROP INDEX IF EXISTS agos_maker_project_dependencies_from_idx;
DROP INDEX IF EXISTS agos_maker_project_dependencies_user_status_idx;

DROP TABLE IF EXISTS agos_maker_project_dependencies;

-- Strip the new constraints + indexes on milestones. Status remap on
-- downgrade: rows with the new values (at_risk / blocked / missed) are
-- remapped back to 'pending' so legacy code paths that assumed
-- completed_at-only semantics keep working. on_track also remaps to
-- pending — the legacy "in-flight" implicit state.

DROP INDEX IF EXISTS agos_maker_build_milestones_risk_idx;
DROP INDEX IF EXISTS agos_maker_build_milestones_blocker_idx;
DROP INDEX IF EXISTS agos_maker_build_milestones_due_at_idx;

UPDATE agos_maker_build_milestones
   SET status = 'pending'
 WHERE status IN ('at_risk','blocked','missed','on_track');

ALTER TABLE agos_maker_build_milestones
    DROP CONSTRAINT IF EXISTS agos_maker_build_milestones_status_chk,
    DROP CONSTRAINT IF EXISTS agos_maker_build_milestones_priority_chk;

ALTER TABLE agos_maker_build_milestones
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS blocked_reason,
    DROP COLUMN IF EXISTS is_blocker,
    DROP COLUMN IF EXISTS priority;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
