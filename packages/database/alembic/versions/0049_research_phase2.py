"""Research OS Phase 2 — Lab notebook entries.

Revision ID: 0049_research_phase2
Revises: 0048_autobiographer_phase7
Create Date: 2026-05-12

Phase 2 of Research OS adds a per-experiment electronic lab notebook
(ELN) — chronological, timestamped, append-by-tradition markdown
entries. Entries are NOT FK'd to ``agos_research_experiments``: the
v0.1.30 platform contract drops cross-OS UUID FKs and pushes ownership
enforcement to the BFF route layer (JOIN against
``agos_research_experiments`` filtered by ``user_id``). Phase 1 already
ships that pattern for the legacy ``hypothesis_id`` pointer.

One new table
-------------
::

    agos_research_notebook_entries
        id              UUID PK
        user_id         UUID NOT NULL                       -- author
        experiment_id   UUID NOT NULL                       -- soft pointer; no FK
        entry_kind      TEXT NOT NULL DEFAULT 'note'
                        CHECK in ('note','observation','result',
                                  'decision','question','todo')
        title           TEXT NOT NULL
        body_md         TEXT NOT NULL DEFAULT ''
        attached_urls   TEXT[] NOT NULL DEFAULT '{}'        -- URL-only
        tags            TEXT[] NOT NULL DEFAULT '{}'
        entry_at        TIMESTAMPTZ NOT NULL DEFAULT now()  -- editable
        archived_at     TIMESTAMPTZ                         -- soft-delete
        metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()

Indexes
-------
1. ``(experiment_id, entry_at DESC)`` — primary timeline view per
   experiment, reverse-chronological.
2. ``(user_id, entry_at DESC)`` — cross-experiment author timeline.
3. GIN on ``tags`` — tag-filter query path.
4. Partial ``(experiment_id) WHERE entry_kind = 'todo' AND archived_at IS NULL``
   — open-todos widget seam (Phase 5+ may surface this; the index lands
   now to avoid a backfill later).

Locked design decisions
-----------------------
- ``entry_at`` is editable (separate from ``created_at``). Solo PhDs
  backfilling a paper journal into the system need to preserve the
  lab-time of the original note even when the typed entry is added
  weeks later.
- DELETE is soft-archive only — sets ``archived_at = now()``. There is
  no hard-delete path. Archived rows hide from the default timeline;
  ``?archived=true`` re-surfaces them.
- ``attached_urls`` is URL-only (no binary upload column). Phase 4's
  literature library + MCP storage layer covers asset transfer; the
  column comment points at the architecture doc.
- No CHECK on ``entry_kind`` member-by-member — the 6-value CHECK on
  the column is the gate. App-side validation re-asserts the same set
  with the canonical labels.
- ``metadata`` reserved for forward flags; defaulting to ``{}`` so the
  shipped repo can omit the column on INSERT without throwing.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS`` / ``CREATE INDEX
IF NOT EXISTS``) so re-running on a partially-applied database is safe.

Bind-marker safety
------------------
Per the prior-phase footgun memory: SQLAlchemy's ``text()`` would parse
``:name`` patterns as bind markers. We use ``op.execute`` with a raw
string constant (NOT ``op.execute(text(...))``) so colon-prefixed
identifiers — should any creep into the body — are not interpreted as
binds. The current SQL has zero ``:<word>`` patterns; the test guard
asserts that.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0049_research_phase2"
down_revision: Union[str, None] = "0048_autobiographer_phase7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. Notebook entries table --------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_research_notebook_entries (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL,
    experiment_id   UUID NOT NULL,
    entry_kind      TEXT NOT NULL DEFAULT 'note',
    title           TEXT NOT NULL,
    body_md         TEXT NOT NULL DEFAULT '',
    attached_urls   TEXT[] NOT NULL DEFAULT '{}'::text[],
    tags            TEXT[] NOT NULL DEFAULT '{}'::text[],
    entry_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at     TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_research_notebook_entries_kind_chk
        CHECK (entry_kind IN ('note','observation','result','decision','question','todo'))
);

COMMENT ON TABLE agos_research_notebook_entries IS
  'Per-experiment electronic lab notebook entries. Chronological, append-by-tradition, soft-archive-only.';

COMMENT ON COLUMN agos_research_notebook_entries.experiment_id IS
  'Soft pointer to agos_research_experiments(id). No FK per platform v0.1.30 contract; the BFF route layer enforces ownership via JOIN against agos_research_experiments filtered by user_id.';

COMMENT ON COLUMN agos_research_notebook_entries.attached_urls IS
  'URL-only attachment list (figure links, raw-data URLs, screenshots). Asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_research_notebook_entries.entry_at IS
  'Lab-time of the entry. Editable separately from created_at so backfilling a paper journal into the system preserves the original date the observation was made.';

COMMENT ON COLUMN agos_research_notebook_entries.archived_at IS
  'Soft-archive marker. NULL = active; non-NULL = the timestamp the entry was archived. Replaces hard delete; DELETE on the route sets this, the restore route clears it.';

COMMENT ON COLUMN agos_research_notebook_entries.metadata IS
  'Free-form per-entry metadata. Reserved for forward-compatible flags.';

-- 2. Indexes -----------------------------------------------------------------
-- Primary timeline view: per-experiment, reverse-chronological by entry_at.
CREATE INDEX IF NOT EXISTS agos_research_notebook_entries_experiment_entry_at_idx
    ON agos_research_notebook_entries (experiment_id, entry_at DESC);

-- Cross-experiment author timeline (for a Phase 5+ "my notebook" view).
CREATE INDEX IF NOT EXISTS agos_research_notebook_entries_user_entry_at_idx
    ON agos_research_notebook_entries (user_id, entry_at DESC);

-- Tag-filter query path. GIN supports @> / && / ANY().
CREATE INDEX IF NOT EXISTS agos_research_notebook_entries_tags_gin
    ON agos_research_notebook_entries USING GIN (tags);

-- Open-todos widget seam. Partial: only the todo + not-archived rows.
-- Phase 5+ may surface a workshop-wide "open todos" widget; the index
-- lands now so no backfill is needed later.
CREATE INDEX IF NOT EXISTS agos_research_notebook_entries_open_todos_idx
    ON agos_research_notebook_entries (experiment_id)
    WHERE entry_kind = 'todo' AND archived_at IS NULL;
"""


_DOWNGRADE_SQL = r"""
-- Reverse order vs upgrade. Drop indexes first, then the table itself.
DROP INDEX IF EXISTS agos_research_notebook_entries_open_todos_idx;
DROP INDEX IF EXISTS agos_research_notebook_entries_tags_gin;
DROP INDEX IF EXISTS agos_research_notebook_entries_user_entry_at_idx;
DROP INDEX IF EXISTS agos_research_notebook_entries_experiment_entry_at_idx;

DROP TABLE IF EXISTS agos_research_notebook_entries;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
