"""Health OS Phase 5c — workout templates + activity plan calendar.

Revision ID: 0019_health_os_phase5c
Revises: 0018_health_os_phase5b
Create Date: 2026-05-10

Phase 5c is the activity-side counterpart to 5b's recipes + meal plan:

- ``agos_mh_workout_template``        — saved workouts (system-seeded OR custom).
- ``agos_mh_workout_template_block``  — ordered blocks within a template.
- ``agos_mh_activity_plan``           — week-keyed plan, one per (user, Monday).
- ``agos_mh_activity_plan_slot``      — items per day (multi-slot supported).

System templates have ``user_id = NULL`` and ``source = 'system'`` and are
shared across tenants. A partial unique index on ``(name) WHERE source = 'system'``
keeps the seed idempotent.

Idempotency: all DDL is ``IF NOT EXISTS``; seed uses ``ON CONFLICT DO NOTHING``.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0019_health_os_phase5c"
down_revision: Union[str, None] = "0018_health_os_phase5b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- Workout templates -------------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_mh_workout_template (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID,
    user_id           UUID,
    source            TEXT NOT NULL DEFAULT 'custom',
    name              TEXT NOT NULL,
    description       TEXT,
    category          TEXT NOT NULL,
    target_intensity  TEXT NOT NULL DEFAULT 'moderate',
    est_duration_min  INTEGER NOT NULL,
    tags              TEXT[] NOT NULL DEFAULT '{}',
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_mh_workout_template_source_enum
        CHECK (source IN ('system', 'custom')),
    CONSTRAINT agos_mh_workout_template_intensity_enum
        CHECK (target_intensity IN ('light', 'moderate', 'vigorous')),
    -- Custom rows must have an owning tenant + user; system rows must not.
    CONSTRAINT agos_mh_workout_template_owner_shape
        CHECK (
            (source = 'system' AND tenant_id IS NULL AND user_id IS NULL)
            OR (source = 'custom' AND tenant_id IS NOT NULL AND user_id IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS agos_mh_workout_template_tenant_user_idx
    ON agos_mh_workout_template (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS agos_mh_workout_template_tags_gin_idx
    ON agos_mh_workout_template USING gin (tags);
CREATE INDEX IF NOT EXISTS agos_mh_workout_template_category_idx
    ON agos_mh_workout_template (category);
CREATE INDEX IF NOT EXISTS agos_mh_workout_template_system_category_idx
    ON agos_mh_workout_template (category)
    WHERE source = 'system';
CREATE UNIQUE INDEX IF NOT EXISTS agos_mh_workout_template_system_name_uq
    ON agos_mh_workout_template (name)
    WHERE source = 'system';

-- Workout template blocks -------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_mh_workout_template_block (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id   UUID NOT NULL REFERENCES agos_mh_workout_template(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'exercise',
    name          TEXT NOT NULL,
    sets          INTEGER,
    reps          TEXT,
    duration_sec  INTEGER,
    rest_sec      INTEGER,
    weight_hint   TEXT,
    notes         TEXT,
    CONSTRAINT agos_mh_workout_template_block_kind_enum
        CHECK (kind IN ('exercise', 'rest', 'note'))
);

CREATE INDEX IF NOT EXISTS agos_mh_workout_template_block_template_pos_idx
    ON agos_mh_workout_template_block (template_id, position);

-- Activity plan (week-keyed) ---------------------------------------------
CREATE TABLE IF NOT EXISTS agos_mh_activity_plan (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL,
    user_id          UUID NOT NULL,
    week_start_date  DATE NOT NULL,
    name             TEXT,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_mh_activity_plan_unique_per_week
        UNIQUE (tenant_id, user_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS agos_mh_activity_plan_tenant_user_idx
    ON agos_mh_activity_plan (tenant_id, user_id);

-- Activity plan slots -----------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_mh_activity_plan_slot (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id              UUID NOT NULL REFERENCES agos_mh_activity_plan(id) ON DELETE CASCADE,
    day_of_week          INTEGER NOT NULL,
    template_id          UUID REFERENCES agos_mh_workout_template(id) ON DELETE SET NULL,
    freeform_text        TEXT,
    target_duration_min  INTEGER,
    target_intensity     TEXT,
    notes                TEXT,
    position             INTEGER NOT NULL,
    CONSTRAINT agos_mh_activity_plan_slot_day_range
        CHECK (day_of_week BETWEEN 0 AND 6),
    CONSTRAINT agos_mh_activity_plan_slot_intensity_enum
        CHECK (target_intensity IS NULL
               OR target_intensity IN ('light', 'moderate', 'vigorous'))
);

CREATE INDEX IF NOT EXISTS agos_mh_activity_plan_slot_grid_idx
    ON agos_mh_activity_plan_slot (plan_id, day_of_week, position);

-- ─── Seed: 8 system workout templates ───────────────────────────────────
-- Idempotent via the unique partial index on (name) WHERE source='system'.

-- 1. Easy walk
WITH ins AS (
    INSERT INTO agos_mh_workout_template
        (source, name, description, category, target_intensity, est_duration_min, tags)
    VALUES
        ('system', 'Easy walk',
         'A gentle outdoor walk at a conversational pace. Good for active recovery, low-mood days, or just getting outside.',
         'cardio', 'light', 30, ARRAY['walk','outdoor','recovery'])
    ON CONFLICT (name) WHERE source = 'system' DO NOTHING
    RETURNING id
)
INSERT INTO agos_mh_workout_template_block (template_id, position, kind, name, duration_sec, notes)
SELECT id, 0, 'exercise', 'Walk at a conversational pace', 1800, 'Slow enough to talk in full sentences.' FROM ins;

-- 2. Brisk walk
WITH ins AS (
    INSERT INTO agos_mh_workout_template
        (source, name, description, category, target_intensity, est_duration_min, tags)
    VALUES
        ('system', 'Brisk walk',
         'A moderate-pace walk that elevates heart rate without making conversation impossible.',
         'cardio', 'moderate', 30, ARRAY['walk','outdoor'])
    ON CONFLICT (name) WHERE source = 'system' DO NOTHING
    RETURNING id
)
INSERT INTO agos_mh_workout_template_block (template_id, position, kind, name, duration_sec, notes)
SELECT id, 0, 'exercise', 'Walk briskly', 1800, 'Roughly 110-130 steps per minute.' FROM ins;

-- 3. Beginner full-body strength
WITH ins AS (
    INSERT INTO agos_mh_workout_template
        (source, name, description, category, target_intensity, est_duration_min, tags)
    VALUES
        ('system', 'Beginner full-body strength',
         'A full-body strength session with bodyweight and light-load compound movements. Three rounds.',
         'strength', 'moderate', 45, ARRAY['strength','full-body','beginner'])
    ON CONFLICT (name) WHERE source = 'system' DO NOTHING
    RETURNING id
)
INSERT INTO agos_mh_workout_template_block (template_id, position, kind, name, sets, reps, rest_sec, weight_hint, notes)
SELECT ins.id, b.position, b.kind, b.name, b.sets, b.reps, b.rest_sec, b.weight_hint, b.notes
FROM ins, (VALUES
    (0, 'exercise', 'Bodyweight squat',     3, '10-12', 60,  'BW',         'Drive through the heels.'),
    (1, 'exercise', 'Push-up',              3, '8-10',  60,  'BW',         'Knees down if needed.'),
    (2, 'exercise', 'Bent-over row',        3, '10',    60,  'light',      'Light dumbbells or a band.'),
    (3, 'exercise', 'Glute bridge',         3, '12',    45,  'BW',         'Squeeze at the top.'),
    (4, 'exercise', 'Dead bug',             3, '8/side',45,  'BW',         'Slow and controlled.'),
    (5, 'exercise', 'Plank',                3, '20-30s',45,  'BW',         'Time-based hold.')
) AS b(position, kind, name, sets, reps, rest_sec, weight_hint, notes);

-- 4. Yoga flow — relaxation
WITH ins AS (
    INSERT INTO agos_mh_workout_template
        (source, name, description, category, target_intensity, est_duration_min, tags)
    VALUES
        ('system', 'Yoga flow — relaxation',
         'A calming 30-minute flow emphasizing breath, mobility, and parasympathetic activation.',
         'mobility', 'light', 30, ARRAY['yoga','mobility','relaxation'])
    ON CONFLICT (name) WHERE source = 'system' DO NOTHING
    RETURNING id
)
INSERT INTO agos_mh_workout_template_block (template_id, position, kind, name, duration_sec, notes)
SELECT ins.id, b.position, b.kind, b.name, b.duration_sec, b.notes
FROM ins, (VALUES
    (0, 'exercise', 'Cat-cow + breath',                300, 'Match breath to movement.'),
    (1, 'exercise', 'Downward dog + sun salutation A', 360, 'Two slow rounds.'),
    (2, 'exercise', 'Low lunge + half-split',          360, 'Both sides.'),
    (3, 'exercise', 'Pigeon pose',                     480, 'Both sides; ease into the stretch.'),
    (4, 'exercise', 'Savasana',                        300, 'Eyes closed, slow breath.')
) AS b(position, kind, name, duration_sec, notes);

-- 5. HIIT — 20 min
WITH ins AS (
    INSERT INTO agos_mh_workout_template
        (source, name, description, category, target_intensity, est_duration_min, tags)
    VALUES
        ('system', 'HIIT — 20 min',
         'High-intensity interval training. 8 rounds of 40s work / 20s rest, full-body bodyweight.',
         'cardio', 'vigorous', 20, ARRAY['hiit','cardio','interval'])
    ON CONFLICT (name) WHERE source = 'system' DO NOTHING
    RETURNING id
)
INSERT INTO agos_mh_workout_template_block (template_id, position, kind, name, duration_sec, rest_sec, notes)
SELECT ins.id, b.position, b.kind, b.name, b.duration_sec, b.rest_sec, b.notes
FROM ins, (VALUES
    (0, 'exercise', 'Jumping jacks',     40, 20, 'Round 1.'),
    (1, 'exercise', 'Bodyweight squats', 40, 20, 'Round 2.'),
    (2, 'exercise', 'Mountain climbers', 40, 20, 'Round 3.'),
    (3, 'exercise', 'Push-ups',          40, 20, 'Round 4.'),
    (4, 'exercise', 'High knees',        40, 20, 'Round 5.'),
    (5, 'exercise', 'Reverse lunges',    40, 20, 'Round 6, alternate legs.'),
    (6, 'exercise', 'Burpees',           40, 20, 'Round 7.'),
    (7, 'exercise', 'Plank-to-shoulder-tap', 40, 20, 'Round 8, finisher.')
) AS b(position, kind, name, duration_sec, rest_sec, notes);

-- 6. Mobility + stretch
WITH ins AS (
    INSERT INTO agos_mh_workout_template
        (source, name, description, category, target_intensity, est_duration_min, tags)
    VALUES
        ('system', 'Mobility + stretch',
         'Short standalone mobility session. Hip openers, thoracic rotation, hamstring + calf stretch.',
         'mobility', 'light', 20, ARRAY['mobility','stretch','recovery'])
    ON CONFLICT (name) WHERE source = 'system' DO NOTHING
    RETURNING id
)
INSERT INTO agos_mh_workout_template_block (template_id, position, kind, name, duration_sec, notes)
SELECT ins.id, b.position, b.kind, b.name, b.duration_sec, b.notes
FROM ins, (VALUES
    (0, 'exercise', '90-90 hip switch',                240, 'Both sides.'),
    (1, 'exercise', 'Thoracic open-book',              240, 'Both sides.'),
    (2, 'exercise', 'Standing forward fold',           180, 'Soft knees.'),
    (3, 'exercise', 'Calf + ankle mobility',           180, 'Both legs.'),
    (4, 'exercise', 'Childs pose',                     360, 'Long hold, deep breath.')
) AS b(position, kind, name, duration_sec, notes);

-- 7. Push day
WITH ins AS (
    INSERT INTO agos_mh_workout_template
        (source, name, description, category, target_intensity, est_duration_min, tags)
    VALUES
        ('system', 'Push day',
         'Classic upper-body push session: chest, shoulders, triceps. Six movements, mostly compound.',
         'strength', 'moderate', 50, ARRAY['strength','push','upper-body'])
    ON CONFLICT (name) WHERE source = 'system' DO NOTHING
    RETURNING id
)
INSERT INTO agos_mh_workout_template_block (template_id, position, kind, name, sets, reps, rest_sec, weight_hint, notes)
SELECT ins.id, b.position, b.kind, b.name, b.sets, b.reps, b.rest_sec, b.weight_hint, b.notes
FROM ins, (VALUES
    (0, 'exercise', 'Bench press',          4, '6-8',   120, '70-80% 1RM',    'Main lift.'),
    (1, 'exercise', 'Overhead press',       3, '8-10',  90,  'moderate',      'Strict form.'),
    (2, 'exercise', 'Incline dumbbell press',3,'10-12', 90,  'moderate',      'Upper chest.'),
    (3, 'exercise', 'Lateral raise',        3, '12-15', 60,  'light',         'Slow eccentric.'),
    (4, 'exercise', 'Triceps pushdown',     3, '12',    60,  'moderate',      'Elbows pinned.'),
    (5, 'exercise', 'Push-up to failure',   1, 'AMRAP', 0,   'BW',            'Burn-out finisher.')
) AS b(position, kind, name, sets, reps, rest_sec, weight_hint, notes);

-- 8. Pull day
WITH ins AS (
    INSERT INTO agos_mh_workout_template
        (source, name, description, category, target_intensity, est_duration_min, tags)
    VALUES
        ('system', 'Pull day',
         'Classic upper-body pull session: back and biceps. Six movements, lat-focused.',
         'strength', 'moderate', 50, ARRAY['strength','pull','upper-body'])
    ON CONFLICT (name) WHERE source = 'system' DO NOTHING
    RETURNING id
)
INSERT INTO agos_mh_workout_template_block (template_id, position, kind, name, sets, reps, rest_sec, weight_hint, notes)
SELECT ins.id, b.position, b.kind, b.name, b.sets, b.reps, b.rest_sec, b.weight_hint, b.notes
FROM ins, (VALUES
    (0, 'exercise', 'Deadlift',             3, '5',     180, '75-85% 1RM',    'Main lift; brace hard.'),
    (1, 'exercise', 'Pull-up or lat pulldown',4,'6-10', 120, 'BW or moderate','Full ROM.'),
    (2, 'exercise', 'Barbell row',          3, '8',     90,  'moderate',      'Pull to lower ribs.'),
    (3, 'exercise', 'Face pull',            3, '12-15', 60,  'light',         'Rear-delt focus.'),
    (4, 'exercise', 'Barbell curl',         3, '10',    60,  'moderate',      'Strict form.'),
    (5, 'exercise', 'Hammer curl',          3, '10-12', 60,  'moderate',      'Brachialis focus.')
) AS b(position, kind, name, sets, reps, rest_sec, weight_hint, notes);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_mh_activity_plan_slot_grid_idx;
DROP TABLE IF EXISTS agos_mh_activity_plan_slot;

DROP INDEX IF EXISTS agos_mh_activity_plan_tenant_user_idx;
DROP TABLE IF EXISTS agos_mh_activity_plan;

DROP INDEX IF EXISTS agos_mh_workout_template_block_template_pos_idx;
DROP TABLE IF EXISTS agos_mh_workout_template_block;

DROP INDEX IF EXISTS agos_mh_workout_template_system_name_uq;
DROP INDEX IF EXISTS agos_mh_workout_template_system_category_idx;
DROP INDEX IF EXISTS agos_mh_workout_template_category_idx;
DROP INDEX IF EXISTS agos_mh_workout_template_tags_gin_idx;
DROP INDEX IF EXISTS agos_mh_workout_template_tenant_user_idx;
DROP TABLE IF EXISTS agos_mh_workout_template;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
