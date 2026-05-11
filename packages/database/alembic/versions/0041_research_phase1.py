"""Research OS Phase 1 — experiment hub + foundation polish.

Revision ID: 0041_research_phase1
Revises: 0040_maker_phase7
Create Date: 2026-05-11

Phase 1 of Research OS promotes ``agos_research_experiments`` from a
child-of-hypothesis scaffold into a first-class per-OS project hub. The
legacy 0005_research_os migration declared::

    hypothesis_id UUID NOT NULL REFERENCES agos_research_hypotheses(id)
                                 ON DELETE CASCADE

That FK + NOT NULL combo cemented experiments as dependents of a single
hypothesis. The Research OS plan (apps/platform-web/content/agentic-os/
research.md) moves the relationship to a dedicated N:M join in Phase 3 so
one experiment can ladder multiple hypotheses. Phase 1 prepares that move
by relaxing the experiment-side coupling only — the join table itself
arrives in 0043_research_phase3.

Legacy ``hypothesis_id`` semantics being relaxed
------------------------------------------------
1. ``NOT NULL`` is dropped. Experiments may now exist with no primary
   hypothesis attached; the legacy column becomes an optional polymorphic
   pointer.
2. The FK constraint to ``agos_research_hypotheses(id) ON DELETE CASCADE``
   is dropped. Cross-cutting per-OS UUIDs are not FK-enforced across the
   rest of the platform (v0.1.30 contract), so we align here.
3. The column remains a nullable UUID for backwards compatibility — Phase
   3 will start ignoring it in favor of ``agos_research_experiment_hypotheses``.

New project-shape columns
-------------------------
The following ADD COLUMN IF NOT EXISTS run on top of the existing legacy
shape (``title``, ``independent``, ``dependent``, ``controls``, ``protocol``,
``success_criteria``, ``status``)::

    cover_image_url        TEXT     NULL
    description            TEXT     NOT NULL DEFAULT ''
    target_completion_date DATE     NULL
    team_size              INTEGER  NULL
    tags                   TEXT[]   NOT NULL DEFAULT '{}'
    phase_progress         JSONB    NOT NULL DEFAULT '{}'::jsonb
    archived_at            TIMESTAMPTZ NULL
    metadata               JSONB    NOT NULL DEFAULT '{}'::jsonb

``description`` lives next to the legacy lab-protocol shape (the
``protocol`` column already exists from 0005 — that one carries the
methods write-up, ``description`` is the project description).

Status taxonomy widening
------------------------
Existing CHECK / column comment had::

    status TEXT NOT NULL DEFAULT 'planned'   -- planned | running | done

Phase 1 widens to the 6-value taxonomy from the plan::

    planning | running | analysis | writeup | published | archived

Legacy rows are remapped on upgrade::

    'planned'  -> 'planning'
    'running'  -> 'running'
    'done'     -> 'published'   (best guess — bench shipments are
                                  treated as a published outcome)
    anything else (defensive) -> 'planning'

Downgrade collapses the new tier back to the legacy three before
restoring the original CHECK::

    'planning'  -> 'planned'
    'running'   -> 'running'
    'analysis'  -> 'running'
    'writeup'   -> 'running'
    'published' -> 'done'
    'archived'  -> 'planned'

phase_progress shape
--------------------
Mirrors Maker's: a JSONB object keyed by phase name with integer 0-100
values. The 6 progress-bearing phases (``archived`` is terminal and not
tracked)::

    {
      "planning":  0,
      "running":   0,
      "analysis":  0,
      "writeup":   0,
      "published": 0
    }

(``published`` is the terminal-but-still-progress-bearing phase; ``archived``
is the terminal-not-progress phase, hence the 5 keys in the default JSONB
object — see ``lib/agentic-os/research/experiments.ts`` for the canonical
default builder.)

New indexes
-----------
- ``(user_id, status, updated_at DESC)`` — hub list with status filter.
- GIN on ``tags`` — tag-filter query path.
- Partial ``(archived_at) WHERE archived_at IS NOT NULL`` — archived list.

All DDL is idempotent so re-running on a partially-applied database (e.g.
a fresh boot that ran 0005 + 0041 in one go) is safe.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0041_research_phase1"
down_revision: Union[str, None] = "0040_maker_phase7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. Relax legacy hypothesis_id NOT NULL + drop CASCADE FK --------------------
-- Drop the FK constraint by name pattern. The 0005 migration declared the FK
-- inline, so Postgres generated a name like
-- ``agos_research_experiments_hypothesis_id_fkey``. We drop by that
-- canonical name and fall through cleanly if it's already gone.
DO $$
DECLARE
    fk_name TEXT;
BEGIN
    SELECT conname INTO fk_name
      FROM pg_constraint
     WHERE conrelid = 'agos_research_experiments'::regclass
       AND contype  = 'f'
       AND conkey   = ARRAY[(
           SELECT attnum FROM pg_attribute
            WHERE attrelid = 'agos_research_experiments'::regclass
              AND attname  = 'hypothesis_id'
       )]::int2[]
     LIMIT 1;
    IF fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE agos_research_experiments DROP CONSTRAINT %I', fk_name);
    END IF;
END $$;

ALTER TABLE agos_research_experiments
    ALTER COLUMN hypothesis_id DROP NOT NULL;

COMMENT ON COLUMN agos_research_experiments.hypothesis_id IS
  'Legacy optional pointer from the 0005_research_os hypothesis-as-parent shape. Nullable, no FK. Phase 3 (0043_research_phase3) introduces agos_research_experiment_hypotheses for the authoritative N:M join.';

-- 2. ADD COLUMN IF NOT EXISTS for the new project-meta columns --------------
ALTER TABLE agos_research_experiments
    ADD COLUMN IF NOT EXISTS cover_image_url        TEXT,
    ADD COLUMN IF NOT EXISTS description            TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS target_completion_date DATE,
    ADD COLUMN IF NOT EXISTS team_size              INTEGER,
    ADD COLUMN IF NOT EXISTS tags                   TEXT[] NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS phase_progress         JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS archived_at            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS metadata               JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN agos_research_experiments.cover_image_url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; for now this is a free-form URL string. See docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_research_experiments.description IS
  'Free-form project description (markdown-safe). Distinct from the legacy ``protocol`` column which holds bench methods.';

COMMENT ON COLUMN agos_research_experiments.phase_progress IS
  'JSONB object keyed by lifecycle phase (planning, running, analysis, writeup, published) with integer 0-100 values. archived is terminal and not tracked.';

COMMENT ON COLUMN agos_research_experiments.archived_at IS
  'Soft-archive marker. NULL means active; non-NULL is the timestamp the experiment was archived. Replaces hard delete in the default lifecycle.';

COMMENT ON COLUMN agos_research_experiments.metadata IS
  'Free-form per-experiment metadata. Reserved for forward-compatible flags.';

-- 3. Status taxonomy widening ---------------------------------------------
-- Phase 0 (0005_research_os) shipped no CHECK constraint object — only an
-- inline comment-as-enum. Be defensive: drop IF EXISTS so a hot-patch CHECK
-- doesn't block the upgrade.
ALTER TABLE agos_research_experiments
    DROP CONSTRAINT IF EXISTS agos_research_experiments_status_chk;

-- Remap legacy values to the new taxonomy. CASE is exhaustive so any
-- unexpected value lands on 'planning' rather than failing the CHECK.
UPDATE agos_research_experiments
   SET status = CASE status
                  WHEN 'planned'   THEN 'planning'
                  WHEN 'running'   THEN 'running'
                  WHEN 'done'      THEN 'published'
                  WHEN 'planning'  THEN 'planning'
                  WHEN 'analysis'  THEN 'analysis'
                  WHEN 'writeup'   THEN 'writeup'
                  WHEN 'published' THEN 'published'
                  WHEN 'archived'  THEN 'archived'
                  ELSE 'planning'
                END;

-- Repoint the default to 'planning' so newly inserted rows land in the
-- first lifecycle phase rather than the legacy 'planned' value.
ALTER TABLE agos_research_experiments
    ALTER COLUMN status SET DEFAULT 'planning';

-- Add the new CHECK constraint covering the 6 locked values.
ALTER TABLE agos_research_experiments
    ADD CONSTRAINT agos_research_experiments_status_chk
    CHECK (status IN ('planning','running','analysis','writeup','published','archived'));

-- 4. Indexes --------------------------------------------------------------
-- Drop the legacy hypothesis-scoped index — the hub list filters by
-- (user_id, status) now. Phase 3 will rebuild a join-table-side index
-- alongside the experiment_hypotheses table.
DROP INDEX IF EXISTS agos_research_experiments_hypothesis_idx;

CREATE INDEX IF NOT EXISTS agos_research_experiments_user_status_idx
    ON agos_research_experiments (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS agos_research_experiments_tags_gin
    ON agos_research_experiments USING GIN (tags);

CREATE INDEX IF NOT EXISTS agos_research_experiments_archived_idx
    ON agos_research_experiments (archived_at)
 WHERE archived_at IS NOT NULL;
"""


_DOWNGRADE_SQL = r"""
-- Reverse the status-enum widening. As with Maker's downgrade, we can't
-- recover the exact prior values for rows that started as 'planned' /
-- 'running' / 'done' once they've moved through the new taxonomy. This
-- is acceptable for a downgrade-and-redeploy flow.
ALTER TABLE agos_research_experiments
    DROP CONSTRAINT IF EXISTS agos_research_experiments_status_chk;

UPDATE agos_research_experiments
   SET status = CASE status
                  WHEN 'planning'  THEN 'planned'
                  WHEN 'running'   THEN 'running'
                  WHEN 'analysis'  THEN 'running'
                  WHEN 'writeup'   THEN 'running'
                  WHEN 'published' THEN 'done'
                  WHEN 'archived'  THEN 'planned'
                  ELSE 'planned'
                END;

ALTER TABLE agos_research_experiments
    ALTER COLUMN status SET DEFAULT 'planned';

-- Drop the new indexes.
DROP INDEX IF EXISTS agos_research_experiments_archived_idx;
DROP INDEX IF EXISTS agos_research_experiments_tags_gin;
DROP INDEX IF EXISTS agos_research_experiments_user_status_idx;

-- Recreate the legacy hypothesis index.
CREATE INDEX IF NOT EXISTS agos_research_experiments_hypothesis_idx
    ON agos_research_experiments (hypothesis_id, created_at DESC);

-- Drop the new columns.
ALTER TABLE agos_research_experiments
    DROP COLUMN IF EXISTS metadata,
    DROP COLUMN IF EXISTS archived_at,
    DROP COLUMN IF EXISTS phase_progress,
    DROP COLUMN IF EXISTS tags,
    DROP COLUMN IF EXISTS team_size,
    DROP COLUMN IF EXISTS target_completion_date,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS cover_image_url;

-- Restore NOT NULL on hypothesis_id. Rows that picked up NULL during the
-- Phase 1 lifetime cannot be downgraded cleanly; pick the first available
-- hypothesis for the user as a best-effort backfill before re-asserting
-- NOT NULL. If no hypothesis exists for the user, leave NULL and skip the
-- constraint re-add for that row (Postgres will fail the ALTER if any
-- NULL remains, so the caller must clean up manually).
UPDATE agos_research_experiments e
   SET hypothesis_id = (
         SELECT h.id FROM agos_research_hypotheses h
          WHERE h.user_id = e.user_id
          ORDER BY h.created_at ASC
          LIMIT 1
       )
 WHERE e.hypothesis_id IS NULL;

ALTER TABLE agos_research_experiments
    ALTER COLUMN hypothesis_id SET NOT NULL;

-- Recreate the legacy FK with ON DELETE CASCADE.
ALTER TABLE agos_research_experiments
    ADD CONSTRAINT agos_research_experiments_hypothesis_id_fkey
    FOREIGN KEY (hypothesis_id)
    REFERENCES agos_research_hypotheses(id)
    ON DELETE CASCADE;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
