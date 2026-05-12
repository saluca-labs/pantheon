"""Research OS Phase 6 — Reproducibility + Deadlines + Dependencies.

Revision ID: 0053_research_phase6
Revises: 0052_research_phase5
Create Date: 2026-05-12

Phase 6 of Research OS adds three new tables under ``agos_research_*``:

  1. ``agos_research_experiment_milestones`` — per-experiment deadline
     tracker. Mirrors the Maker Phase 6 milestones taxonomy but is a
     brand-new table (Research never carried a Phase-3-style Gantt strip,
     so there is no legacy table to ALTER). Columns: ``id UUID PK``,
     ``experiment_id UUID NOT NULL`` (NO FK per v0.1.30 platform
     contract), ``user_id UUID NOT NULL``, ``title TEXT NOT NULL``,
     ``due_at DATE`` (calendar date — round-trips cleanly through routes
     via YYYY-MM-DD strings), ``status TEXT NOT NULL DEFAULT 'pending'``
     CHECK in ``(pending, at_risk, blocked, on_track, done, missed)``,
     ``priority TEXT NOT NULL DEFAULT 'medium'`` CHECK in
     ``(low, medium, high, critical)``, ``is_blocker BOOLEAN NOT NULL
     DEFAULT false``, ``blocked_reason TEXT``, ``notes_md TEXT``,
     ``completed_at TIMESTAMPTZ``, ``metadata JSONB``. Indexes:
     ``(experiment_id, due_at)`` WHERE ``due_at IS NOT NULL`` for the
     deadline view; ``(is_blocker)`` WHERE ``is_blocker = true`` for the
     blockers feed; ``(experiment_id, status)`` WHERE ``status IN
     ('at_risk','blocked','missed')`` for the top-blockers query path.

  2. ``agos_research_experiment_dependencies`` — directed edges in a
     per-user cross-experiment graph. An edge
     ``(from_experiment_id → to_experiment_id, kind)`` reads "from
     depends on to" (or "to blocks from", depending on ``kind``).
     Columns: ``id UUID PK``, ``user_id UUID NOT NULL``,
     ``from_experiment_id UUID NOT NULL`` (NO FK),
     ``to_experiment_id UUID NOT NULL`` (NO FK), ``kind TEXT NOT NULL
     DEFAULT 'feeds'`` CHECK in ``(feeds, blocks, informs, replicates)``,
     ``status TEXT NOT NULL DEFAULT 'open'`` CHECK in ``(open, cleared)``,
     ``notes TEXT``, ``metadata JSONB``. Constraints: UNIQUE
     ``(from_experiment_id, to_experiment_id, kind)`` — no duplicate
     edges of the same kind in the same direction;
     CHECK ``(from_experiment_id != to_experiment_id)`` — no self-loops.
     Indexes: ``(user_id, status)`` for list-by-status,
     ``(from_experiment_id)`` for upstream lookup,
     ``(to_experiment_id)`` for downstream lookup, partial
     ``(user_id) WHERE status = 'open'`` for the Top Blockers widget.

  3. ``agos_research_reproducibility_checks`` — per-experiment
     reproducibility checklist. Columns: ``id UUID PK``,
     ``experiment_id UUID NOT NULL`` (NO FK), ``user_id UUID NOT NULL``,
     ``item_key TEXT NOT NULL`` (machine name; user-extensible — NO
     Postgres CHECK on the value, the app validates with
     ``^[a-z0-9_]+$`` max 60 chars), ``state TEXT NOT NULL DEFAULT
     'pending'`` CHECK in ``(pending, in_progress, done, not_applicable,
     waived)``, ``evidence_url TEXT`` (URL-only per MCP contract),
     ``notes TEXT``, ``completed_at TIMESTAMPTZ``, ``metadata JSONB``.
     Constraints: UNIQUE ``(experiment_id, item_key)`` — one row per
     item per experiment. Indexes: ``(experiment_id, state)``.

Derived rollup (read-only)
--------------------------
The Phase 6 reproducibility score is derived on read, never stored:

    reproducibility_score = done / (pending + in_progress + done)

where ``not_applicable`` and ``waived`` are EXCLUDED from the
denominator. When the denominator is zero (every item is excluded),
the route returns ``score = null`` so the UI can render an explicit
"no scored items" state rather than collapsing to 0% or 100%. See the
column comment on ``agos_research_reproducibility_checks.state``.

Locked design decisions
-----------------------
- **Milestones are per-experiment.** Cross-experiment milestone views
  (the workshop top-blockers feed) join on ``experiment_id`` filtered
  by ``user_id`` via the experiments table. NO FK on ``experiment_id``
  per the v0.1.30 platform contract.
- **Dependencies are directed edges with a 4-kind taxonomy.** ``feeds``
  is the default (mirrors how research artifacts flow); ``blocks`` is
  the hard-dep flavour that surfaces on the Top Blockers feed;
  ``informs`` is soft; ``replicates`` is the reproducibility flavour.
- **Reproducibility item_keys are user-extensible.** The 7 canonical
  keys (``raw_data_archived``, ``methods_pinned``, ``code_published``,
  ``preregistration_filed``, ``ethics_filed``, ``data_dictionary_written``,
  ``analysis_reproducible``) are SEEDED lazily by the app on first GET
  to ``/reproducibility`` for an experiment — not enforced by Postgres.
  The app validates ``item_key`` matches ``^[a-z0-9_]+$`` max 60 chars
  on POST. NO CHECK on the value at the DB layer.
- **Score derivation lives in the app.** The route's GET handler
  computes the rollup from the row state distribution; there is no
  generated/stored column for the score. This keeps the policy
  exercisable by unit tests without spinning up Postgres.
- **No FK on cross-experiment columns.** Both edge endpoints in the
  dependencies table and the experiment_id columns in milestones +
  reproducibility carry per-OS UUIDs without referential integrity to
  ``agos_research_experiments``, matching the v0.1.30 contract.

Idempotency
-----------
All DDL is idempotent: ``CREATE TABLE IF NOT EXISTS`` /
``CREATE INDEX IF NOT EXISTS`` / ``CREATE UNIQUE INDEX IF NOT EXISTS``.
Safe to re-run on a partially-applied database.

Bind-marker safety
------------------
Per prior-phase footgun: SQLAlchemy's ``text()`` parses ``:word``
patterns as bind markers. This module uses ``op.execute`` with a raw
string constant (NOT ``op.execute(text(...))``); the SQL bodies carry
zero ``:<word>`` patterns (the test guard asserts this).

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0053_research_phase6"
down_revision: Union[str, None] = "0052_research_phase5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. agos_research_experiment_milestones (per-experiment deadlines) --------
CREATE TABLE IF NOT EXISTS agos_research_experiment_milestones (
    id              UUID PRIMARY KEY,
    experiment_id   UUID NOT NULL,
    user_id         UUID NOT NULL,
    title           TEXT NOT NULL,
    due_at          DATE,
    status          TEXT NOT NULL DEFAULT 'pending',
    priority        TEXT NOT NULL DEFAULT 'medium',
    is_blocker      BOOLEAN NOT NULL DEFAULT false,
    blocked_reason  TEXT,
    notes_md        TEXT,
    completed_at    TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_research_experiment_milestones_status_chk
        CHECK (status IN ('pending','at_risk','blocked','on_track','done','missed')),
    CONSTRAINT agos_research_experiment_milestones_priority_chk
        CHECK (priority IN ('low','medium','high','critical'))
);

COMMENT ON TABLE agos_research_experiment_milestones IS
  'Per-experiment milestones — deadline tracker. Mirrors Maker Phase 6 taxonomy. Cross-experiment views (the Top Blockers feed) join this table on experiment_id filtered by user_id via the experiments table; experiment_id carries NO FK per the v0.1.30 platform contract.';

COMMENT ON COLUMN agos_research_experiment_milestones.experiment_id IS
  'Soft pointer to agos_research_experiments(id). No FK per platform v0.1.30 contract; the BFF route layer enforces ownership via JOIN.';

COMMENT ON COLUMN agos_research_experiment_milestones.due_at IS
  'Target calendar date for the milestone (no time-of-day). NULL means undated; the deadline view sorts dated rows by due_at ASC, undated last.';

COMMENT ON COLUMN agos_research_experiment_milestones.status IS
  'Phase 6 stored status. CHECK in (pending, at_risk, blocked, on_track, done, missed). The routing layer keeps completed_at in sync with status=done: setting status=done stamps completed_at to now() if null; setting status to any non-done value clears completed_at back to null.';

COMMENT ON COLUMN agos_research_experiment_milestones.priority IS
  'Phase 6 priority pill. CHECK in (low, medium, high, critical). Default medium.';

COMMENT ON COLUMN agos_research_experiment_milestones.is_blocker IS
  'Phase 6 hard-blocker flag. Surfaced on the Top Blockers feed independently of status.';

COMMENT ON COLUMN agos_research_experiment_milestones.blocked_reason IS
  'Free-form explanation for an at_risk / blocked / missed status, or the reason a milestone is flagged as a blocker.';

CREATE INDEX IF NOT EXISTS agos_research_experiment_milestones_experiment_idx
    ON agos_research_experiment_milestones (experiment_id);

CREATE INDEX IF NOT EXISTS agos_research_experiment_milestones_due_at_idx
    ON agos_research_experiment_milestones (experiment_id, due_at)
    WHERE due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS agos_research_experiment_milestones_blocker_idx
    ON agos_research_experiment_milestones (is_blocker)
    WHERE is_blocker = true;

CREATE INDEX IF NOT EXISTS agos_research_experiment_milestones_risk_idx
    ON agos_research_experiment_milestones (experiment_id, status)
    WHERE status IN ('at_risk','blocked','missed');

CREATE INDEX IF NOT EXISTS agos_research_experiment_milestones_user_idx
    ON agos_research_experiment_milestones (user_id);

-- 2. agos_research_experiment_dependencies (directed edge graph) -----------
CREATE TABLE IF NOT EXISTS agos_research_experiment_dependencies (
    id                  UUID PRIMARY KEY,
    user_id             UUID NOT NULL,
    from_experiment_id  UUID NOT NULL,
    to_experiment_id    UUID NOT NULL,
    kind                TEXT NOT NULL DEFAULT 'feeds',
    status              TEXT NOT NULL DEFAULT 'open',
    notes               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_research_experiment_dependencies_kind_chk
        CHECK (kind IN ('feeds','blocks','informs','replicates')),
    CONSTRAINT agos_research_experiment_dependencies_status_chk
        CHECK (status IN ('open','cleared')),
    CONSTRAINT agos_research_experiment_dependencies_no_self_loop_chk
        CHECK (from_experiment_id != to_experiment_id),
    CONSTRAINT agos_research_experiment_dependencies_edge_unique
        UNIQUE (from_experiment_id, to_experiment_id, kind)
);

COMMENT ON TABLE agos_research_experiment_dependencies IS
  'Directed edges in a per-user cross-experiment dependency graph. An edge (from -> to, kind) reads "from depends on to". The Top Blockers feed filters for kind=blocks AND status=open.';

COMMENT ON COLUMN agos_research_experiment_dependencies.from_experiment_id IS
  'Per-OS experiment UUID; NOT a FK by design. Matches the v0.1.30 platform contract where cross-cutting per-OS columns carry per-OS UUIDs without referential integrity.';

COMMENT ON COLUMN agos_research_experiment_dependencies.to_experiment_id IS
  'Per-OS experiment UUID; NOT a FK by design. Matches the v0.1.30 platform contract where cross-cutting per-OS columns carry per-OS UUIDs without referential integrity.';

COMMENT ON COLUMN agos_research_experiment_dependencies.kind IS
  'Edge taxonomy: feeds (default — to feeds data/output into from), blocks (hard dependency — from cannot proceed until to is cleared, surfaces on Top Blockers), informs (soft — to provides context but not a gate), replicates (from replicates the protocol/findings of to).';

COMMENT ON COLUMN agos_research_experiment_dependencies.status IS
  'open (live edge surfaced by the Top Blockers widget when kind=blocks) | cleared (resolved, kept for history). The widget filters on status=open + kind=blocks.';

CREATE INDEX IF NOT EXISTS agos_research_experiment_dependencies_user_status_idx
    ON agos_research_experiment_dependencies (user_id, status);

CREATE INDEX IF NOT EXISTS agos_research_experiment_dependencies_from_idx
    ON agos_research_experiment_dependencies (from_experiment_id);

CREATE INDEX IF NOT EXISTS agos_research_experiment_dependencies_to_idx
    ON agos_research_experiment_dependencies (to_experiment_id);

CREATE INDEX IF NOT EXISTS agos_research_experiment_dependencies_open_idx
    ON agos_research_experiment_dependencies (user_id)
    WHERE status = 'open';

-- 3. agos_research_reproducibility_checks (per-experiment checklist) -------
CREATE TABLE IF NOT EXISTS agos_research_reproducibility_checks (
    id              UUID PRIMARY KEY,
    experiment_id   UUID NOT NULL,
    user_id         UUID NOT NULL,
    item_key        TEXT NOT NULL,
    state           TEXT NOT NULL DEFAULT 'pending',
    evidence_url    TEXT,
    notes           TEXT,
    completed_at    TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_research_reproducibility_checks_state_chk
        CHECK (state IN ('pending','in_progress','done','not_applicable','waived')),
    CONSTRAINT agos_research_reproducibility_checks_item_unique
        UNIQUE (experiment_id, item_key)
);

COMMENT ON TABLE agos_research_reproducibility_checks IS
  'Per-experiment reproducibility checklist. The 7 canonical item_keys (raw_data_archived, methods_pinned, code_published, preregistration_filed, ethics_filed, data_dictionary_written, analysis_reproducible) are seeded lazily by the app on first GET to /reproducibility. Additional item_keys are user-extensible — the app validates the regex ^[a-z0-9_]+$ max 60 chars; NO Postgres CHECK on the value. The derived reproducibility_score = done / (pending + in_progress + done); not_applicable and waived rows are EXCLUDED from the denominator. Score is computed on read, never stored.';

COMMENT ON COLUMN agos_research_reproducibility_checks.experiment_id IS
  'Soft pointer to agos_research_experiments(id). No FK per platform v0.1.30 contract; the BFF route layer enforces ownership via JOIN.';

COMMENT ON COLUMN agos_research_reproducibility_checks.item_key IS
  'Machine name for the checklist item. User-extensible — the app validates ^[a-z0-9_]+$ max 60 chars; NO CHECK at the DB layer so users can add domain-specific items without a migration.';

COMMENT ON COLUMN agos_research_reproducibility_checks.state IS
  'Phase 6 checklist state. CHECK in (pending, in_progress, done, not_applicable, waived). The derived rollup: score = done / (pending + in_progress + done); not_applicable and waived are EXCLUDED from the denominator. The routing layer keeps completed_at in sync: setting state=done stamps completed_at to now() if null; setting state to any non-done value clears completed_at back to null.';

COMMENT ON COLUMN agos_research_reproducibility_checks.evidence_url IS
  'External URL to evidence (preregistration link, Zenodo DOI, GitHub repo, etc.). URL-only per the MCP storage-transfer contract; this column never stores binary.';

CREATE INDEX IF NOT EXISTS agos_research_reproducibility_checks_experiment_state_idx
    ON agos_research_reproducibility_checks (experiment_id, state);

CREATE INDEX IF NOT EXISTS agos_research_reproducibility_checks_user_idx
    ON agos_research_reproducibility_checks (user_id);
"""


_DOWNGRADE_SQL = r"""
-- Reverse order vs upgrade.
DROP INDEX IF EXISTS agos_research_reproducibility_checks_user_idx;
DROP INDEX IF EXISTS agos_research_reproducibility_checks_experiment_state_idx;
DROP TABLE IF EXISTS agos_research_reproducibility_checks;

DROP INDEX IF EXISTS agos_research_experiment_dependencies_open_idx;
DROP INDEX IF EXISTS agos_research_experiment_dependencies_to_idx;
DROP INDEX IF EXISTS agos_research_experiment_dependencies_from_idx;
DROP INDEX IF EXISTS agos_research_experiment_dependencies_user_status_idx;
DROP TABLE IF EXISTS agos_research_experiment_dependencies;

DROP INDEX IF EXISTS agos_research_experiment_milestones_user_idx;
DROP INDEX IF EXISTS agos_research_experiment_milestones_risk_idx;
DROP INDEX IF EXISTS agos_research_experiment_milestones_blocker_idx;
DROP INDEX IF EXISTS agos_research_experiment_milestones_due_at_idx;
DROP INDEX IF EXISTS agos_research_experiment_milestones_experiment_idx;
DROP TABLE IF EXISTS agos_research_experiment_milestones;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
