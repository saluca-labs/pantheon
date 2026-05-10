"""Health OS Phase 5b — USDA cache + recipes + meal plans.

Revision ID: 0018_health_os_phase5b
Revises: 0017_health_os_phase5a
Create Date: 2026-05-10

Phase 5b layers the richer half of the nutrition stack on top of 5a:

- ``agos_mh_recipe``             — user-built or imported recipes.
- ``agos_mh_recipe_ingredient``  — ordered line items (food_item OR freeform).
- ``agos_mh_meal_plan``          — week-keyed plan, one per (user, Monday).
- ``agos_mh_meal_plan_slot``     — slotted entries (day × meal × position).

The 5a ``agos_mh_food_item`` table is reused unchanged — USDA-cached rows
land in it via the BFF with ``source='usda'`` and ``user_id NULL``.

Idempotency: all DDL is ``IF NOT EXISTS``; re-applies are safe.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0018_health_os_phase5b"
down_revision: Union[str, None] = "0017_health_os_phase5a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- USDA cache uniqueness ---------------------------------------------------
-- 5a added a *non-unique* partial index on ``usda_fdc_id`` for fast lookup.
-- 5b's BFF wants ``ON CONFLICT (usda_fdc_id) DO UPDATE`` to upsert refreshed
-- nutrient values, which requires a UNIQUE index. Add it here, partial on
-- ``usda_fdc_id IS NOT NULL`` so the column stays optional for custom rows.
-- The old non-unique index is left in place (cheap; will hit cache anyway).
CREATE UNIQUE INDEX IF NOT EXISTS agos_mh_food_item_usda_fdc_uq
    ON agos_mh_food_item (usda_fdc_id)
    WHERE usda_fdc_id IS NOT NULL;

-- Recipes -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_mh_recipe (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    user_id       UUID NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT,
    servings      NUMERIC NOT NULL DEFAULT 1,
    prep_minutes  INTEGER,
    cook_minutes  INTEGER,
    instructions  TEXT,
    tags          TEXT[] NOT NULL DEFAULT '{}',
    image_url     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_mh_recipe_tenant_user_idx
    ON agos_mh_recipe (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS agos_mh_recipe_tags_gin_idx
    ON agos_mh_recipe USING gin (tags);

-- Recipe ingredients ------------------------------------------------------
-- ``food_item_id`` nullable so freeform rows ("a pinch of salt") work
-- without a catalog hit; ``freeform_name`` is the display label in that case.
CREATE TABLE IF NOT EXISTS agos_mh_recipe_ingredient (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id      UUID NOT NULL REFERENCES agos_mh_recipe(id) ON DELETE CASCADE,
    food_item_id   UUID REFERENCES agos_mh_food_item(id) ON DELETE SET NULL,
    freeform_name  TEXT,
    quantity       NUMERIC NOT NULL DEFAULT 1,
    unit           TEXT,
    position       INTEGER NOT NULL,
    notes          TEXT
);

CREATE INDEX IF NOT EXISTS agos_mh_recipe_ingredient_recipe_pos_idx
    ON agos_mh_recipe_ingredient (recipe_id, position);

-- Meal plans --------------------------------------------------------------
-- ``week_start_date`` is enforced as a Monday in the BFF (``mondayOf``);
-- no DB constraint because timezone semantics live with the caller.
CREATE TABLE IF NOT EXISTS agos_mh_meal_plan (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL,
    user_id          UUID NOT NULL,
    week_start_date  DATE NOT NULL,
    name             TEXT,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_mh_meal_plan_unique_per_week
        UNIQUE (tenant_id, user_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS agos_mh_meal_plan_tenant_user_idx
    ON agos_mh_meal_plan (tenant_id, user_id);

-- Meal plan slots ---------------------------------------------------------
-- Each slot points at one of: a recipe, a single food item, or a freeform
-- string ("leftovers"). The BFF tolerates all-null (no plan, e.g. "skip").
CREATE TABLE IF NOT EXISTS agos_mh_meal_plan_slot (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         UUID NOT NULL REFERENCES agos_mh_meal_plan(id) ON DELETE CASCADE,
    day_of_week     INTEGER NOT NULL,
    meal_slot       TEXT NOT NULL,
    recipe_id       UUID REFERENCES agos_mh_recipe(id) ON DELETE SET NULL,
    food_item_id    UUID REFERENCES agos_mh_food_item(id) ON DELETE SET NULL,
    freeform_text   TEXT,
    servings        NUMERIC NOT NULL DEFAULT 1,
    notes           TEXT,
    position        INTEGER NOT NULL,
    CONSTRAINT agos_mh_meal_plan_slot_slot_enum
        CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
    CONSTRAINT agos_mh_meal_plan_slot_day_range
        CHECK (day_of_week BETWEEN 0 AND 6)
);

CREATE INDEX IF NOT EXISTS agos_mh_meal_plan_slot_grid_idx
    ON agos_mh_meal_plan_slot (plan_id, day_of_week, meal_slot, position);
"""


_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_mh_food_item_usda_fdc_uq;

DROP INDEX IF EXISTS agos_mh_meal_plan_slot_grid_idx;
DROP TABLE IF EXISTS agos_mh_meal_plan_slot;

DROP INDEX IF EXISTS agos_mh_meal_plan_tenant_user_idx;
DROP TABLE IF EXISTS agos_mh_meal_plan;

DROP INDEX IF EXISTS agos_mh_recipe_ingredient_recipe_pos_idx;
DROP TABLE IF EXISTS agos_mh_recipe_ingredient;

DROP INDEX IF EXISTS agos_mh_recipe_tags_gin_idx;
DROP INDEX IF EXISTS agos_mh_recipe_tenant_user_idx;
DROP TABLE IF EXISTS agos_mh_recipe;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
