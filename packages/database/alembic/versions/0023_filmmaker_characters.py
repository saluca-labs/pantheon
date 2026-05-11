"""Filmmaker OS Phase 3 — characters + relationships.

Revision ID: 0023_filmmaker_characters
Revises: 0022_filmmaker_story_documents
Create Date: 2026-05-10

Phase 3 introduces character sheets and a relationship graph for the
Filmmaker OS. Characters are the second-most-referenced entity in the
plan after projects; downstream phases (script breakdown, AI coach,
dialogue analysis) attribute work back to these rows.

Tables
------

`agos_filmmaker_characters`
    Per-project character sheet. Free-form fields (role, archetype,
    psychology, voice) plus a single denormalised portrait URL pointing
    at storage provided by the user's MCP-mediated upload flow (see
    docs/architecture/mcp-storage-transfer.md). No native object store.

`agos_filmmaker_character_relationships`
    Directed-or-mutual edges between two characters in the same
    project, with kind, optional description, and 0-10 tension scale.
    The `project_id` column is denormalised so the project-level
    relationship view doesn't have to climb through two FKs per row.

Role taxonomy
-------------

    protagonist | antagonist | deuteragonist | supporting | minor | ensemble

Relationship kind taxonomy
--------------------------

    ally | rival | family | romantic | mentor_to | student_of
        | colleague | enemy | estranged | other

Direction
---------

    mutual      — symmetric (friendship, family, colleague)
    directional — asymmetric (mentor_to / student_of, one-way crush)

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0023_filmmaker_characters"
down_revision: Union[str, None] = "0022_filmmaker_story_documents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Characters --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_filmmaker_characters (
    id                   UUID        PRIMARY KEY,
    project_id           UUID        NOT NULL
                                     REFERENCES agos_filmmaker_projects(id)
                                     ON DELETE CASCADE,
    name                 TEXT        NOT NULL,
    role                 TEXT        NOT NULL DEFAULT 'supporting',
    archetype            TEXT        NULL,
    logline              TEXT        NULL,
    age                  TEXT        NULL,
    pronouns             TEXT        NULL,
    gender               TEXT        NULL,
    occupation           TEXT        NULL,
    backstory            TEXT        NULL,
    goals                TEXT        NULL,
    needs                TEXT        NULL,
    fears                TEXT        NULL,
    wounds               TEXT        NULL,
    arc                  TEXT        NULL,
    voice_notes          TEXT        NULL,
    physical_description TEXT        NULL,
    portrait_url         TEXT        NULL,
    tags                 TEXT[]      NOT NULL DEFAULT '{}'::text[],
    metadata             JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_filmmaker_characters_role_chk
        CHECK (role IN ('protagonist','antagonist','deuteragonist',
                        'supporting','minor','ensemble'))
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_characters_project_idx
    ON agos_filmmaker_characters (project_id);

CREATE INDEX IF NOT EXISTS agos_filmmaker_characters_project_role_idx
    ON agos_filmmaker_characters (project_id, role);

CREATE INDEX IF NOT EXISTS agos_filmmaker_characters_tags_idx
    ON agos_filmmaker_characters USING gin (tags);

COMMENT ON COLUMN agos_filmmaker_characters.portrait_url IS
  'Free-form URL string. No upload UI. See docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_filmmaker_characters.role IS
  'protagonist | antagonist | deuteragonist | supporting | minor | ensemble.';

COMMENT ON COLUMN agos_filmmaker_characters.archetype IS
  'Free-form (Hero / Mentor / Trickster / ...). User-driven, not enumerated.';

-- Character relationships -------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_filmmaker_character_relationships (
    id           UUID        PRIMARY KEY,
    project_id   UUID        NOT NULL
                             REFERENCES agos_filmmaker_projects(id)
                             ON DELETE CASCADE,
    from_id      UUID        NOT NULL
                             REFERENCES agos_filmmaker_characters(id)
                             ON DELETE CASCADE,
    to_id        UUID        NOT NULL
                             REFERENCES agos_filmmaker_characters(id)
                             ON DELETE CASCADE,
    kind         TEXT        NOT NULL DEFAULT 'other',
    direction    TEXT        NOT NULL DEFAULT 'mutual',
    description  TEXT        NULL,
    tension      INTEGER     NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_filmmaker_relationships_self_chk
        CHECK (from_id <> to_id),
    CONSTRAINT agos_filmmaker_relationships_kind_chk
        CHECK (kind IN ('ally','rival','family','romantic','mentor_to',
                        'student_of','colleague','enemy','estranged','other')),
    CONSTRAINT agos_filmmaker_relationships_direction_chk
        CHECK (direction IN ('directional','mutual')),
    CONSTRAINT agos_filmmaker_relationships_tension_chk
        CHECK (tension IS NULL OR (tension >= 0 AND tension <= 10))
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_relationships_project_idx
    ON agos_filmmaker_character_relationships (project_id);

CREATE INDEX IF NOT EXISTS agos_filmmaker_relationships_from_idx
    ON agos_filmmaker_character_relationships (from_id);

CREATE INDEX IF NOT EXISTS agos_filmmaker_relationships_to_idx
    ON agos_filmmaker_character_relationships (to_id);

COMMENT ON COLUMN agos_filmmaker_character_relationships.project_id IS
  'Denormalised from from_id->project for fast per-project listing.';

COMMENT ON COLUMN agos_filmmaker_character_relationships.tension IS
  '0=harmonious .. 10=fierce conflict. NULL = unspecified.';
"""

_DOWNGRADE_SQL = """
DROP TABLE IF EXISTS agos_filmmaker_character_relationships;
DROP TABLE IF EXISTS agos_filmmaker_characters;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
