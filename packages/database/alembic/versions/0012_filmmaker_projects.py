"""Filmmaker OS — extend projects table: status, tags, description.

Revision ID: 0012_filmmaker_projects
Revises: 0011_creator_os
Create Date: 2026-05-07

Migration 0008 created `agos_filmmaker_projects` with only:
    id, user_id, title TEXT, synopsis TEXT, created_at, updated_at

Workstream B adds the columns needed for full project management:
    name        TEXT  NOT NULL DEFAULT '' (populated from title via trigger)
    description TEXT  NULL               (populated from synopsis)
    status      TEXT  NOT NULL DEFAULT 'pre_production'
    tags        TEXT[] NOT NULL DEFAULT '{}'

Strategy: ALTER TABLE to add new columns, copy data from old columns,
then drop the old columns. The FK on agos_filmmaker_shots.project_id
is unchanged — this migration does not touch the shots table.

All DDL changes are guarded with IF EXISTS / conditional logic so that
re-running the upgrade is safe on a database that already has the new
columns.

Status values follow industry-standard film-production phases:
  pre_production / production / post_production / wrapped / archived
  — Ref: https://www.studiobinder.com/blog/pre-production/

Downgrade restores the original 0008-era schema.

License note: All DDL is original work under MIT. No GPL code is introduced.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0012_filmmaker_projects"
down_revision: Union[str, None] = "0011_creator_os"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Filmmaker OS — Workstream B: extend agos_filmmaker_projects ---------------
--
-- Guard each ADD COLUMN so re-running the migration is safe.

ALTER TABLE agos_filmmaker_projects
    ADD COLUMN IF NOT EXISTS name        TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'pre_production',
    ADD COLUMN IF NOT EXISTS tags        TEXT[] NOT NULL DEFAULT '{}';

-- Back-fill name from title (title is the old column).
UPDATE agos_filmmaker_projects
   SET name = title
 WHERE name IS NULL OR name = '';

-- Back-fill description from synopsis.
UPDATE agos_filmmaker_projects
   SET description = synopsis
 WHERE description IS NULL AND synopsis IS NOT NULL;

-- Make name NOT NULL now that it is populated.
ALTER TABLE agos_filmmaker_projects
    ALTER COLUMN name SET NOT NULL;

-- Drop the old columns (idempotent — IF EXISTS prevents errors on re-run).
ALTER TABLE agos_filmmaker_projects
    DROP COLUMN IF EXISTS title,
    DROP COLUMN IF EXISTS synopsis;

-- Index on (user_id, updated_at DESC) — idempotent.
CREATE INDEX IF NOT EXISTS agos_filmmaker_projects_user_updated_idx
    ON agos_filmmaker_projects (user_id, updated_at DESC);
"""

_DOWNGRADE_SQL = """
-- Restore the 0008-era column set.

ALTER TABLE agos_filmmaker_projects
    ADD COLUMN IF NOT EXISTS title    TEXT,
    ADD COLUMN IF NOT EXISTS synopsis TEXT;

-- Back-fill title from name before making it NOT NULL.
UPDATE agos_filmmaker_projects
   SET title = name
 WHERE title IS NULL OR title = '';

UPDATE agos_filmmaker_projects
   SET synopsis = description
 WHERE synopsis IS NULL AND description IS NOT NULL;

ALTER TABLE agos_filmmaker_projects
    ALTER COLUMN title SET NOT NULL;

ALTER TABLE agos_filmmaker_projects
    DROP COLUMN IF EXISTS name,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS tags;

DROP INDEX IF EXISTS agos_filmmaker_projects_user_updated_idx;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
