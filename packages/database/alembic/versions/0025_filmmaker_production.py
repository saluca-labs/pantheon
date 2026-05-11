"""Filmmaker OS Phase 5 — script breakdown + stripboard scheduling.

Revision ID: 0025_filmmaker_production
Revises: 0024_filmmaker_screenplay
Create Date: 2026-05-10

Phase 5 lays the production layer on top of the Phase 4 Fountain parser:

`agos_filmmaker_breakdown_elements`
    Production elements tagged on a single scene (cast, props, vehicles,
    costume, vfx, sfx, etc.). One row per element instance — quantities
    live on a column, not duplicated rows. Optional FK to
    `agos_filmmaker_characters` so a "SARAH" element can be linked back
    to the character sheet.

`agos_filmmaker_scene_breakdown_meta`
    Per-scene production metadata: page eighths, est. shoot minutes,
    complexity, status. One row per scene; the repo auto-creates with
    defaults on first read for a cleaner UX.

`agos_filmmaker_shooting_days`
    Calendar entries — day_number is ordinal (1, 2, 3, ...) per project +
    unit; shoot_date may be NULL ("TBD"). A unit can have multiple days;
    `(project_id, day_number, unit)` is unique.

`agos_filmmaker_schedule_strips`
    Scenes assigned to days, the stripboard core. Unique
    `(shooting_day_id, scene_id)` — a scene appears at most once per day.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0025_filmmaker_production"
down_revision: Union[str, None] = "0024_filmmaker_screenplay"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Breakdown elements -----------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_filmmaker_breakdown_elements (
    id              UUID        PRIMARY KEY,
    screenplay_id   UUID        NOT NULL
                                REFERENCES agos_filmmaker_screenplays(id)
                                ON DELETE CASCADE,
    scene_id        UUID        NOT NULL
                                REFERENCES agos_filmmaker_screenplay_scenes(id)
                                ON DELETE CASCADE,
    category        TEXT        NOT NULL,
    name            TEXT        NOT NULL,
    description     TEXT        NULL,
    quantity        INTEGER     NOT NULL DEFAULT 1,
    is_principal    BOOLEAN     NOT NULL DEFAULT false,
    character_id    UUID        NULL
                                REFERENCES agos_filmmaker_characters(id)
                                ON DELETE SET NULL,
    metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_filmmaker_breakdown_elements_category_chk
        CHECK (category IN ('cast','extras','stunts','props','vehicles',
                            'animals','costume','makeup','set_dressing',
                            'special_effects','sound_effects','music',
                            'location','other'))
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_breakdown_elements_scene_idx
    ON agos_filmmaker_breakdown_elements (scene_id);

CREATE INDEX IF NOT EXISTS agos_filmmaker_breakdown_elements_screenplay_cat_idx
    ON agos_filmmaker_breakdown_elements (screenplay_id, category);

CREATE INDEX IF NOT EXISTS agos_filmmaker_breakdown_elements_character_idx
    ON agos_filmmaker_breakdown_elements (character_id)
    WHERE character_id IS NOT NULL;

-- Per-scene production meta ---------------------------------------------

CREATE TABLE IF NOT EXISTS agos_filmmaker_scene_breakdown_meta (
    id                UUID        PRIMARY KEY,
    scene_id          UUID        NOT NULL UNIQUE
                                  REFERENCES agos_filmmaker_screenplay_scenes(id)
                                  ON DELETE CASCADE,
    eighths           INTEGER     NOT NULL DEFAULT 0,
    est_shoot_minutes INTEGER     NULL,
    notes             TEXT        NULL,
    complexity        TEXT        NULL,
    status            TEXT        NOT NULL DEFAULT 'unscheduled',
    metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_filmmaker_scene_breakdown_meta_complexity_chk
        CHECK (complexity IS NULL
               OR complexity IN ('simple','standard','complex','epic')),
    CONSTRAINT agos_filmmaker_scene_breakdown_meta_status_chk
        CHECK (status IN ('unscheduled','scheduled','shot','omitted',
                          'reshoot_needed'))
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_scene_breakdown_meta_scene_idx
    ON agos_filmmaker_scene_breakdown_meta (scene_id);

-- Shooting days ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_filmmaker_shooting_days (
    id          UUID        PRIMARY KEY,
    project_id  UUID        NOT NULL
                            REFERENCES agos_filmmaker_projects(id)
                            ON DELETE CASCADE,
    shoot_date  DATE        NULL,
    day_number  INTEGER     NOT NULL,
    label       TEXT        NULL,
    call_time   TIME        NULL,
    wrap_time   TIME        NULL,
    unit        TEXT        NOT NULL DEFAULT 'main',
    status      TEXT        NOT NULL DEFAULT 'planned',
    notes       TEXT        NULL,
    metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_filmmaker_shooting_days_unit_chk
        CHECK (unit IN ('main','second_unit','splinter')),
    CONSTRAINT agos_filmmaker_shooting_days_status_chk
        CHECK (status IN ('planned','in_progress','completed','cancelled')),
    CONSTRAINT agos_filmmaker_shooting_days_unique
        UNIQUE (project_id, day_number, unit)
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_shooting_days_project_day_idx
    ON agos_filmmaker_shooting_days (project_id, day_number);

CREATE INDEX IF NOT EXISTS agos_filmmaker_shooting_days_date_idx
    ON agos_filmmaker_shooting_days (shoot_date)
    WHERE shoot_date IS NOT NULL;

-- Schedule strips -------------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_filmmaker_schedule_strips (
    id               UUID        PRIMARY KEY,
    shooting_day_id  UUID        NOT NULL
                                 REFERENCES agos_filmmaker_shooting_days(id)
                                 ON DELETE CASCADE,
    scene_id         UUID        NOT NULL
                                 REFERENCES agos_filmmaker_screenplay_scenes(id)
                                 ON DELETE CASCADE,
    order_index      INTEGER     NOT NULL,
    est_minutes      INTEGER     NULL,
    notes            TEXT        NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_filmmaker_schedule_strips_unique
        UNIQUE (shooting_day_id, scene_id)
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_schedule_strips_day_order_idx
    ON agos_filmmaker_schedule_strips (shooting_day_id, order_index);

CREATE INDEX IF NOT EXISTS agos_filmmaker_schedule_strips_scene_idx
    ON agos_filmmaker_schedule_strips (scene_id);
"""

_DOWNGRADE_SQL = """
DROP TABLE IF EXISTS agos_filmmaker_schedule_strips;
DROP TABLE IF EXISTS agos_filmmaker_shooting_days;
DROP TABLE IF EXISTS agos_filmmaker_scene_breakdown_meta;
DROP TABLE IF EXISTS agos_filmmaker_breakdown_elements;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
