"""Filmmaker OS Phase 1 — extend agos_filmmaker_projects with hub metadata.

Revision ID: 0021_filmmaker_project_meta
Revises: 0020_health_os_phase6
Create Date: 2026-05-10

Phase 1 of the Project Hub buildout. Adds the columns that the per-project
detail page (header + phase tracker + stats) needs:

    format                 TEXT     enum-string, default 'feature'
    logline                TEXT     NULL
    cover_image_url        TEXT     NULL   — external URL string (see note below)
    phase_progress         JSONB    NOT NULL DEFAULT '{}'
    target_completion_date DATE     NULL
    team_size              INTEGER  NULL
    metadata               JSONB    NOT NULL DEFAULT '{}'

Note on cover_image_url
-----------------------
Asset uploads (Google Drive, R2, Dropbox) are intentionally deferred to a
separate MCP-mediated storage transfer workstream. For now this column is a
free-form URL string only — there is no upload UI and no managed asset
table. The column comment carries this contract.

Format taxonomy follows production conventions documented at:
  https://www.studiobinder.com/blog/types-of-film-genres/
  https://www.masterclass.com/articles/film-production-stages

phase_progress shape
--------------------
JSONB object with one integer percentage (0–100) per lifecycle phase::

    {
      "development":     0,
      "pre_production":  0,
      "production":      0,
      "post_production": 0,
      "distribution":    0
    }

Missing phases are treated as 0 by the UI; the column is required so a
default empty object is stored for back-filled rows.

All DDL is idempotent (`ADD COLUMN IF NOT EXISTS`) so re-running the
migration on a partially-applied database is safe.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0021_filmmaker_project_meta"
down_revision: Union[str, None] = "0020_health_os_phase6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
ALTER TABLE agos_filmmaker_projects
    ADD COLUMN IF NOT EXISTS format                 TEXT    NOT NULL DEFAULT 'feature',
    ADD COLUMN IF NOT EXISTS logline                TEXT,
    ADD COLUMN IF NOT EXISTS cover_image_url        TEXT,
    ADD COLUMN IF NOT EXISTS phase_progress         JSONB   NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS target_completion_date DATE,
    ADD COLUMN IF NOT EXISTS team_size              INTEGER,
    ADD COLUMN IF NOT EXISTS metadata               JSONB   NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN agos_filmmaker_projects.cover_image_url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; for now this is a free-form URL string.';

COMMENT ON COLUMN agos_filmmaker_projects.phase_progress IS
  'JSONB object: { development, pre_production, production, post_production, distribution } each int 0-100.';

COMMENT ON COLUMN agos_filmmaker_projects.format IS
  'Production format: feature | short | tv | pilot | webseries | documentary | music_video | commercial.';
"""

_DOWNGRADE_SQL = """
ALTER TABLE agos_filmmaker_projects
    DROP COLUMN IF EXISTS metadata,
    DROP COLUMN IF EXISTS team_size,
    DROP COLUMN IF EXISTS target_completion_date,
    DROP COLUMN IF EXISTS phase_progress,
    DROP COLUMN IF EXISTS cover_image_url,
    DROP COLUMN IF EXISTS logline,
    DROP COLUMN IF EXISTS format;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
