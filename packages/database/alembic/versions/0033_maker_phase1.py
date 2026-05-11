"""Maker OS Phase 1 — project hub rename + status taxonomy + meta columns.

Revision ID: 0033_maker_phase1
Revises: 0032_cyber_phase5
Create Date: 2026-05-10

Phase 1 of Maker OS promotes the existing ``agos_maker_builds`` scaffold into
a Filmmaker-style project hub:

    1. RENAME ``agos_maker_builds`` to ``agos_maker_projects`` (idempotent — if
       the table is already the new name the rename is skipped).
    2. ADD COLUMN IF NOT EXISTS::

           cover_image_url        TEXT     NULL
           target_completion_date DATE     NULL
           team_size              INTEGER  NULL
           phase_progress         JSONB    NOT NULL DEFAULT '{}'::jsonb
           metadata               JSONB    NOT NULL DEFAULT '{}'::jsonb

    3. Replace the 3-value comment-only status enum
       (``planning | in_progress | done``) with the locked 8-value enum::

           concept | design | procurement | fabrication | assembly |
           commissioning | done | archived

       Existing rows are remapped::

           planning      -> concept
           in_progress   -> fabrication
           done          -> done
           (anything else, defensively) -> concept

       A ``CHECK`` constraint named ``agos_maker_projects_status_chk`` is then
       added.  Phase 0 shipped no constraint object, only a column comment;
       the migration drops it ``IF EXISTS`` so re-applying is safe.

Note on cover_image_url
-----------------------
Asset uploads (Drive, R2, Dropbox) are intentionally deferred to a separate
MCP-mediated storage transfer workstream. For now this column is a free-form
URL string only — there is no upload UI and no managed asset table. The
column comment carries this contract (mirrors Filmmaker 0021_filmmaker_project_meta).

phase_progress shape
--------------------
JSONB object with one integer percentage (0-100) per lifecycle phase
(``archived`` is a terminal status, not a progress bucket)::

    {
      "concept":       0,
      "design":        0,
      "procurement":   0,
      "fabrication":   0,
      "assembly":      0,
      "commissioning": 0,
      "done":          0
    }

Missing phases are treated as 0 by the UI; the column is required so a
default empty object is stored for back-filled rows.

All DDL is idempotent so re-running the migration on a partially-applied
database (e.g. a fresh boot that ran 0004 + 0033 in one go) is safe.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0033_maker_phase1"
down_revision: Union[str, None] = "0032_cyber_phase5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. Rename agos_maker_builds -> agos_maker_projects (idempotent) ----------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables
         WHERE schemaname = 'public' AND tablename = 'agos_maker_builds'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_tables
         WHERE schemaname = 'public' AND tablename = 'agos_maker_projects'
    ) THEN
        ALTER TABLE agos_maker_builds RENAME TO agos_maker_projects;
    END IF;
END $$;

-- Also rename the matching index so future ANALYZE/pg_dump output stays clean.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public' AND indexname = 'agos_maker_builds_user_idx'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public' AND indexname = 'agos_maker_projects_user_idx'
    ) THEN
        ALTER INDEX agos_maker_builds_user_idx RENAME TO agos_maker_projects_user_idx;
    END IF;
END $$;

-- 2. ADD COLUMN IF NOT EXISTS for the new project-meta columns -------------
ALTER TABLE agos_maker_projects
    ADD COLUMN IF NOT EXISTS cover_image_url        TEXT,
    ADD COLUMN IF NOT EXISTS target_completion_date DATE,
    ADD COLUMN IF NOT EXISTS team_size              INTEGER,
    ADD COLUMN IF NOT EXISTS phase_progress         JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS metadata               JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN agos_maker_projects.cover_image_url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; for now this is a free-form URL string.';

COMMENT ON COLUMN agos_maker_projects.phase_progress IS
  'JSONB object: { concept, design, procurement, fabrication, assembly, commissioning, done } each int 0-100.';

COMMENT ON COLUMN agos_maker_projects.metadata IS
  'Free-form per-project metadata. Reserved for forward-compatible flags (e.g. program affinity, integration ids).';

-- 3. Status taxonomy migration --------------------------------------------
-- Drop any prior CHECK constraint on status (Phase 0 shipped none, but be
-- defensive: the constraint may have been added by a hot-patch or by a
-- prior partial re-apply of this migration).
ALTER TABLE agos_maker_projects
    DROP CONSTRAINT IF EXISTS agos_maker_projects_status_chk;

-- Remap legacy enum values to the new taxonomy.  CASE is exhaustive so
-- any unexpected value lands on 'concept' rather than failing the CHECK.
UPDATE agos_maker_projects
   SET status = CASE status
                  WHEN 'planning'    THEN 'concept'
                  WHEN 'in_progress' THEN 'fabrication'
                  WHEN 'on_hold'     THEN 'concept'
                  WHEN 'complete'    THEN 'done'
                  WHEN 'done'        THEN 'done'
                  WHEN 'archived'    THEN 'archived'
                  WHEN 'concept'     THEN 'concept'
                  WHEN 'design'      THEN 'design'
                  WHEN 'procurement' THEN 'procurement'
                  WHEN 'fabrication' THEN 'fabrication'
                  WHEN 'assembly'    THEN 'assembly'
                  WHEN 'commissioning' THEN 'commissioning'
                  ELSE 'concept'
                END;

-- Repoint the default to 'concept' so newly inserted rows land in the
-- first lifecycle phase rather than the legacy 'planning' value.
ALTER TABLE agos_maker_projects
    ALTER COLUMN status SET DEFAULT 'concept';

-- Add the new CHECK constraint.
ALTER TABLE agos_maker_projects
    ADD CONSTRAINT agos_maker_projects_status_chk
    CHECK (status IN ('concept','design','procurement','fabrication','assembly','commissioning','done','archived'));
"""


_DOWNGRADE_SQL = r"""
-- Reverse the status-enum migration.  We can't recover the exact prior
-- values for rows that started as 'planning'/'in_progress'/'done' because
-- 'concept' on the way back maps to 'planning', losing on_hold/complete
-- nuance.  This is acceptable for a downgrade-and-redeploy flow.
ALTER TABLE agos_maker_projects
    DROP CONSTRAINT IF EXISTS agos_maker_projects_status_chk;

UPDATE agos_maker_projects
   SET status = CASE status
                  WHEN 'concept'       THEN 'planning'
                  WHEN 'design'        THEN 'planning'
                  WHEN 'procurement'   THEN 'planning'
                  WHEN 'fabrication'   THEN 'in_progress'
                  WHEN 'assembly'      THEN 'in_progress'
                  WHEN 'commissioning' THEN 'in_progress'
                  WHEN 'done'          THEN 'done'
                  WHEN 'archived'      THEN 'archived'
                  ELSE 'planning'
                END;

ALTER TABLE agos_maker_projects
    ALTER COLUMN status SET DEFAULT 'planning';

-- Drop the new columns.
ALTER TABLE agos_maker_projects
    DROP COLUMN IF EXISTS metadata,
    DROP COLUMN IF EXISTS phase_progress,
    DROP COLUMN IF EXISTS team_size,
    DROP COLUMN IF EXISTS target_completion_date,
    DROP COLUMN IF EXISTS cover_image_url;

-- Rename back.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public' AND indexname = 'agos_maker_projects_user_idx'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public' AND indexname = 'agos_maker_builds_user_idx'
    ) THEN
        ALTER INDEX agos_maker_projects_user_idx RENAME TO agos_maker_builds_user_idx;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables
         WHERE schemaname = 'public' AND tablename = 'agos_maker_projects'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_tables
         WHERE schemaname = 'public' AND tablename = 'agos_maker_builds'
    ) THEN
        ALTER TABLE agos_maker_projects RENAME TO agos_maker_builds;
    END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
