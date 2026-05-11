"""Filmmaker OS Phase 4 — Fountain screenplay editor.

Revision ID: 0024_filmmaker_screenplay
Revises: 0023_filmmaker_characters
Create Date: 2026-05-10

Phase 4 ships the centrepiece of the Filmmaker OS: a Fountain-format
screenplay editor with server-side scene parsing and version history.
Every downstream phase (breakdown, schedule, AI coverage, storyboard)
reads from the scenes table produced here.

Tables
------

`agos_filmmaker_screenplays`
    One per project (in practice — the schema does not enforce
    uniqueness so feature/short pilot pairs can share a project later).
    Carries presentation metadata (title, format, status) and a pointer
    to the current head version.

`agos_filmmaker_screenplay_versions`
    Append-only version log. Each explicit "Save draft" writes a new
    row; the prior head's `is_head` is cleared. The `fountain_text`
    column holds the raw plain-text Fountain source.

`agos_filmmaker_screenplay_scenes`
    Re-parsed on every version save. Each row is one scene from the
    head-or-historical version, with the heading split into
    interior/location/time-of-day, per-character dialogue word counts,
    and concatenated action + dialogue text for search and future AI
    context.

Format taxonomy
---------------

    feature | short | tv_pilot | tv_episode | webisode | stage_play

Status taxonomy
---------------

    draft | revision | production_draft | shooting_script | archived

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0024_filmmaker_screenplay"
down_revision: Union[str, None] = "0023_filmmaker_characters"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Screenplays ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_filmmaker_screenplays (
    id              UUID        PRIMARY KEY,
    project_id      UUID        NOT NULL
                                REFERENCES agos_filmmaker_projects(id)
                                ON DELETE CASCADE,
    title           TEXT        NOT NULL,
    format          TEXT        NOT NULL DEFAULT 'feature',
    status          TEXT        NOT NULL DEFAULT 'draft',
    head_version_id UUID        NULL,
    metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_filmmaker_screenplays_format_chk
        CHECK (format IN ('feature','short','tv_pilot','tv_episode',
                          'webisode','stage_play')),
    CONSTRAINT agos_filmmaker_screenplays_status_chk
        CHECK (status IN ('draft','revision','production_draft',
                          'shooting_script','archived'))
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_screenplays_project_idx
    ON agos_filmmaker_screenplays (project_id);

COMMENT ON COLUMN agos_filmmaker_screenplays.head_version_id IS
  'Points at agos_filmmaker_screenplay_versions.id of the current head. '
  'FK declared after the versions table is created.';

-- Screenplay versions ----------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_filmmaker_screenplay_versions (
    id                  UUID         PRIMARY KEY,
    screenplay_id       UUID         NOT NULL
                                     REFERENCES agos_filmmaker_screenplays(id)
                                     ON DELETE CASCADE,
    version_number      INTEGER      NOT NULL,
    label               TEXT         NULL,
    is_head             BOOLEAN      NOT NULL DEFAULT false,
    fountain_text       TEXT         NOT NULL DEFAULT '',
    word_count          INTEGER      NOT NULL DEFAULT 0,
    page_count_estimate NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT agos_filmmaker_screenplay_versions_unique
        UNIQUE (screenplay_id, version_number)
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_screenplay_versions_head_idx
    ON agos_filmmaker_screenplay_versions (screenplay_id)
    WHERE is_head = true;

CREATE INDEX IF NOT EXISTS agos_filmmaker_screenplay_versions_screenplay_idx
    ON agos_filmmaker_screenplay_versions (screenplay_id);

COMMENT ON COLUMN agos_filmmaker_screenplay_versions.is_head IS
  'Exactly one version per screenplay is is_head=true at any time. '
  'Enforced transactionally at the repo layer (saveDraftVersion / restore).';

COMMENT ON COLUMN agos_filmmaker_screenplay_versions.page_count_estimate IS
  '1 page ≈ 250 words heuristic. Refine with real page-break parsing later.';

-- Now wire the FK from screenplays.head_version_id ----------------------

ALTER TABLE agos_filmmaker_screenplays
    ADD CONSTRAINT agos_filmmaker_screenplays_head_version_fk
    FOREIGN KEY (head_version_id)
    REFERENCES agos_filmmaker_screenplay_versions(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

-- Screenplay scenes (re-derived on every version save) ------------------

CREATE TABLE IF NOT EXISTS agos_filmmaker_screenplay_scenes (
    id                     UUID         PRIMARY KEY,
    screenplay_id          UUID         NOT NULL
                                        REFERENCES agos_filmmaker_screenplays(id)
                                        ON DELETE CASCADE,
    version_id             UUID         NOT NULL
                                        REFERENCES agos_filmmaker_screenplay_versions(id)
                                        ON DELETE CASCADE,
    scene_number           INTEGER      NOT NULL,
    heading                TEXT         NOT NULL,
    interior               BOOLEAN      NULL,
    location               TEXT         NULL,
    time_of_day            TEXT         NULL,
    page_start             NUMERIC(5,2) NULL,
    eighths                INTEGER      NULL,
    dialogue_word_counts   JSONB        NOT NULL DEFAULT '{}'::jsonb,
    action_text            TEXT         NULL,
    dialogue_text          TEXT         NULL,
    metadata               JSONB        NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_screenplay_scenes_lookup_idx
    ON agos_filmmaker_screenplay_scenes (screenplay_id, version_id, scene_number);

CREATE INDEX IF NOT EXISTS agos_filmmaker_screenplay_scenes_batch_idx
    ON agos_filmmaker_screenplay_scenes (screenplay_id, version_id);

CREATE INDEX IF NOT EXISTS agos_filmmaker_screenplay_scenes_version_idx
    ON agos_filmmaker_screenplay_scenes (version_id)
    WHERE version_id IS NOT NULL;

COMMENT ON COLUMN agos_filmmaker_screenplay_scenes.interior IS
  'true=INT, false=EXT, NULL=other (EST., etc.).';

COMMENT ON COLUMN agos_filmmaker_screenplay_scenes.eighths IS
  'Page eighths for shooting-schedule estimates. NULL until Phase 5 fills it.';

COMMENT ON COLUMN agos_filmmaker_screenplay_scenes.dialogue_word_counts IS
  'Map of CHARACTER_NAME -> word count for dialogue spoken IN THIS SCENE.';
"""

_DOWNGRADE_SQL = """
DROP TABLE IF EXISTS agos_filmmaker_screenplay_scenes;
ALTER TABLE IF EXISTS agos_filmmaker_screenplays
    DROP CONSTRAINT IF EXISTS agos_filmmaker_screenplays_head_version_fk;
DROP TABLE IF EXISTS agos_filmmaker_screenplay_versions;
DROP TABLE IF EXISTS agos_filmmaker_screenplays;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
