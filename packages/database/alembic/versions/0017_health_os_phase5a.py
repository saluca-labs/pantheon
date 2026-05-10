"""Health OS Phase 5a — nutrition + activity foundation.

Revision ID: 0017_health_os_phase5a
Revises: 0016_health_os_phase3
Create Date: 2026-05-10

Phase 5a is the data-model + simple-logger half of Phase 5. The richer
USDA FoodData Central cache + recipe + meal-plan UI ships in 5b; the
ActivityPlanBuilder ships in 5c. Both 5b and 5c build on the tables
introduced here without re-shaping them.

Tables introduced
-----------------
- ``agos_mh_food_item``      — food cache. Rows are either user-custom
                                (``source='custom'``, ``user_id`` set)
                                or USDA-cached (``source='usda'``,
                                ``user_id`` NULL, ``usda_fdc_id`` set).
                                Only ``'custom'`` rows are written in
                                5a; 5b begins populating USDA rows.
- ``agos_mh_meal_entry``      — what the user ate. References a
                                food_item OR carries a freeform
                                description + manual nutrient overrides.
- ``agos_mh_activity_entry``  — what the user did. Free-text
                                ``activity_type`` (the BFF normalizes
                                via MET_TABLE for kcal estimation).

No new screener/profile tables — height / weight come from the
existing ``agos_mh_profile`` (Phase 1).

Trigram extension
-----------------
The ``name`` column on ``agos_mh_food_item`` is indexed via GIN with
``gin_trgm_ops`` so 5b's typeahead stays fast at catalog scale.
``CREATE EXTENSION pg_trgm`` is guarded — when the extension is not
available (e.g. on a hardened managed Postgres), the migration logs a
NOTICE and falls back to a plain btree on lower(name) so the column is
still indexed for prefix lookups.

Idempotency: all DDL is ``IF NOT EXISTS`` / ``ON CONFLICT DO NOTHING``;
re-applies are safe.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0017_health_os_phase5a"
down_revision: Union[str, None] = "0016_health_os_phase3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- Trigram extension is best-effort. If the role lacks CREATE EXTENSION
-- on this database the DO block swallows the error and the rest of the
-- migration falls back to a btree index on lower(name).
DO $$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
    EXCEPTION WHEN insufficient_privilege OR feature_not_supported THEN
        RAISE NOTICE 'pg_trgm not available; falling back to btree(lower(name)) on agos_mh_food_item';
    END;
END$$;

-- Food item ---------------------------------------------------------------
-- ``source`` discriminates user-custom rows (always tenant- + user-scoped)
-- from USDA-cached rows (``user_id`` NULL, shared read across tenants).
-- 5a writes only ``source='custom'``; ``usda_fdc_id`` is reserved for 5b.
CREATE TABLE IF NOT EXISTS agos_mh_food_item (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    user_id         UUID,
    source          TEXT NOT NULL DEFAULT 'custom',
    usda_fdc_id     TEXT,
    name            TEXT NOT NULL,
    brand           TEXT,
    serving_size_g  NUMERIC,
    serving_label   TEXT,
    kcal            NUMERIC,
    protein_g       NUMERIC,
    carbs_g         NUMERIC,
    fat_g           NUMERIC,
    fiber_g         NUMERIC,
    sugar_g         NUMERIC,
    sodium_mg       NUMERIC,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_mh_food_item_source_enum
        CHECK (source IN ('usda', 'custom'))
);

CREATE INDEX IF NOT EXISTS agos_mh_food_item_tenant_user_idx
    ON agos_mh_food_item (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS agos_mh_food_item_usda_fdc_idx
    ON agos_mh_food_item (usda_fdc_id)
    WHERE usda_fdc_id IS NOT NULL;

-- Conditional name index: GIN trigram when pg_trgm is installed,
-- btree(lower(name)) otherwise. Both indexes are IF NOT EXISTS-guarded.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS agos_mh_food_item_name_trgm_idx
                   ON agos_mh_food_item USING gin (name gin_trgm_ops)';
    ELSE
        EXECUTE 'CREATE INDEX IF NOT EXISTS agos_mh_food_item_name_lower_idx
                   ON agos_mh_food_item (lower(name))';
    END IF;
END$$;

-- Meal entry --------------------------------------------------------------
-- ``food_item_id`` is nullable so freeform entries (just a description +
-- manual nutrient overrides) work without a catalog hit. The repo enforces
-- "must have either food_item OR (freeform_description OR any override)".
CREATE TABLE IF NOT EXISTS agos_mh_meal_entry (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL,
    user_id              UUID NOT NULL,
    entry_date           DATE NOT NULL,
    meal_slot            TEXT NOT NULL,
    food_item_id         UUID REFERENCES agos_mh_food_item(id) ON DELETE SET NULL,
    freeform_description TEXT,
    servings             NUMERIC NOT NULL DEFAULT 1,
    kcal_override        NUMERIC,
    protein_g_override   NUMERIC,
    carbs_g_override     NUMERIC,
    fat_g_override       NUMERIC,
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_mh_meal_entry_slot_enum
        CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack'))
);

CREATE INDEX IF NOT EXISTS agos_mh_meal_entry_user_date_idx
    ON agos_mh_meal_entry (tenant_id, user_id, entry_date);

-- Activity entry ----------------------------------------------------------
-- ``activity_type`` is free-text by design; the BFF lower-cases and looks
-- it up in MET_TABLE for kcal estimation. Anything not in the table falls
-- back to MET=4.0 (moderate). ``kcal_burned`` is repo-filled if null.
CREATE TABLE IF NOT EXISTS agos_mh_activity_entry (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    user_id       UUID NOT NULL,
    entry_date    DATE NOT NULL,
    activity_type TEXT NOT NULL,
    duration_min  INT NOT NULL,
    intensity     TEXT NOT NULL DEFAULT 'moderate',
    kcal_burned   NUMERIC,
    notes         TEXT,
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_mh_activity_entry_intensity_enum
        CHECK (intensity IN ('light', 'moderate', 'vigorous')),
    CONSTRAINT agos_mh_activity_entry_duration_range
        CHECK (duration_min > 0 AND duration_min <= 1440)
);

CREATE INDEX IF NOT EXISTS agos_mh_activity_entry_user_date_idx
    ON agos_mh_activity_entry (tenant_id, user_id, entry_date);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_mh_activity_entry_user_date_idx;
DROP TABLE IF EXISTS agos_mh_activity_entry;

DROP INDEX IF EXISTS agos_mh_meal_entry_user_date_idx;
DROP TABLE IF EXISTS agos_mh_meal_entry;

DROP INDEX IF EXISTS agos_mh_food_item_name_trgm_idx;
DROP INDEX IF EXISTS agos_mh_food_item_name_lower_idx;
DROP INDEX IF EXISTS agos_mh_food_item_usda_fdc_idx;
DROP INDEX IF EXISTS agos_mh_food_item_tenant_user_idx;
DROP TABLE IF EXISTS agos_mh_food_item;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
