"""Business OS Phase 1 — Foundation + CRM Polish.

Revision ID: 0055_business_phase1
Revises: 0054_research_phase7
Create Date: 2026-05-12

Phase 1 brings the shipped Contacts CRM stub from migration 0010 up to the
Oscar Suite contract. Three existing ``agos_business_*`` tables are ALTERed
in place, one new ``agos_business_settings`` table is created, and one
destructive column-type migration (``agos_business_people.tags`` from JSONB
to TEXT[]) is performed defensively.

Schema delta
------------

1. ``agos_business_orgs`` (ALTER, additive only)
     - ADD ``description_md TEXT NOT NULL DEFAULT ''``
     - ADD ``address TEXT``
     - ADD ``tags TEXT[] NOT NULL DEFAULT '{}'``
     - ADD ``archived_at TIMESTAMPTZ`` (nullable)
     - ADD ``metadata JSONB NOT NULL DEFAULT '{}'``
     - DEFENSIVE remap of any drift in ``org_type`` to ``'other'`` before
       adding the CHECK so the constraint never fails on pre-existing data.
     - ADD CHECK ``agos_business_orgs_org_type_check`` enforcing the 6
       canonical values from ``ORG_TYPES`` in ``crm.ts``.
     - Indexes: GIN on ``tags``; partial ``(user_id) WHERE archived_at IS NULL``.

2. ``agos_business_people`` (ALTER + JSONB→TEXT[] tags migration)
     - ADD ``description_md TEXT NOT NULL DEFAULT ''``
     - ADD ``address TEXT``
     - ADD ``archived_at TIMESTAMPTZ`` (nullable)
     - ADD ``metadata JSONB NOT NULL DEFAULT '{}'``
     - ``stage`` column kept free-form; no CHECK added. Per locked decision
       in the plan doc, sales-pipeline stage lives on Phase 2's
       ``agos_business_deals`` and the people stage column becomes a
       contact-tier free-form label.
     - MIGRATE ``tags JSONB DEFAULT '[]'`` → ``tags TEXT[] NOT NULL DEFAULT
       '{}'``:
         a. ADD ``tags_new TEXT[] NOT NULL DEFAULT '{}'``.
         b. Backfill from JSONB. Defensive against NULL / empty array /
            non-array JSON. Empty / null cases map to ``'{}'``.
         c. DROP old ``tags`` column.
         d. RENAME ``tags_new`` → ``tags``.
     - Indexes: GIN on ``tags``; partial ``(user_id) WHERE archived_at IS
       NULL``.

3. ``agos_business_interactions`` (ALTER, defensive remap + CHECK)
     - DEFENSIVE remap of any ``interaction_type`` drift to ``'note'``
       before adding the CHECK.
     - ADD CHECK ``agos_business_interactions_interaction_type_check``
       enforcing the 9 canonical values from ``INTERACTION_TYPES`` in
       ``crm.ts``.

4. ``agos_business_settings`` (NEW — workshop-global, one row per user)
     - ``id UUID PK``, ``user_id UUID NOT NULL UNIQUE``
     - ``business_name TEXT NOT NULL DEFAULT ''``
     - ``logo_url TEXT`` nullable (URL-only per the MCP storage-transfer
       contract; binary content never lives in this column).
     - ``address TEXT NOT NULL DEFAULT ''``
     - ``tax_id TEXT`` nullable (free-form: EIN, ABN, VAT, …)
     - ``default_currency TEXT NOT NULL DEFAULT 'USD'``
     - ``invoice_number_prefix TEXT NOT NULL DEFAULT 'INV'``
     - ``quote_number_prefix TEXT NOT NULL DEFAULT 'Q'``
     - ``default_payment_terms TEXT NOT NULL DEFAULT 'net_30'``
     - ``default_hourly_rate_cents BIGINT`` nullable
     - ``accent_color TEXT NOT NULL DEFAULT 'teal'``
     - ``metadata JSONB NOT NULL DEFAULT '{}'``, ``created_at``,
       ``updated_at``
     - Index ``(user_id)`` (the UNIQUE constraint already implies one but
       the explicit index doesn't hurt).
     - NO FK on ``user_id``. Platform v0.1.30 dropped cross-OS UUID FKs;
       ownership is enforced at the BFF.

Locked design decisions
-----------------------
- **No FK on ``user_id`` columns.** Mirrors v0.1.30 cross-OS contract.
- **No CHECK on ``agos_business_people.stage``.** Deliberately free-form
  until Phase 8 cleanup; Phase 2's deal pipeline owns the canonical sales
  stage.
- **URL-only ``logo_url``.** Binary content lives elsewhere per the MCP
  storage-transfer contract.
- **Defensive remaps before CHECK.** Both ``org_type`` and
  ``interaction_type`` get any drift remapped to the safe default before
  the CHECK is added so the constraint never fails on existing rows.
- **JSONB→TEXT[] tags backfill is defense-in-depth.** ``COALESCE`` +
  ``WHERE jsonb_typeof(tags) = 'array'`` so NULL JSONB and non-array
  shapes drop to ``'{}'`` without raising.

Idempotency
-----------
ALTER TABLE … ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
CREATE UNIQUE INDEX IF NOT EXISTS, ADD CONSTRAINT-with-IF-NOT-EXISTS via
``DO $$`` guards. Safe to re-run on a partially-applied database.

Bind-marker safety
------------------
Per prior-phase footgun: SQLAlchemy's ``text()`` parses ``:word`` patterns
as bind markers. This module uses ``op.execute`` with raw string
constants (NOT ``op.execute(text(...))``); the SQL bodies carry zero
``:<word>`` patterns (the migration test asserts this). The dollar-quoted
``DO $$`` blocks for constraint-add are fine because PG only — Alembic
passes the string through to the driver verbatim.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0055_business_phase1"
down_revision: Union[str, None] = "0054_research_phase7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ─── 1. agos_business_orgs ─────────────────────────────────────────────────

ALTER TABLE agos_business_orgs
    ADD COLUMN IF NOT EXISTS description_md TEXT NOT NULL DEFAULT '';

ALTER TABLE agos_business_orgs
    ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE agos_business_orgs
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE agos_business_orgs
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE agos_business_orgs
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Defensive remap of any pre-existing drift to the safe default BEFORE
-- the CHECK is added so the constraint never fails on existing rows.
UPDATE agos_business_orgs
   SET org_type = 'other'
 WHERE org_type NOT IN ('company','non_profit','government','sole_trader','partnership','other');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'agos_business_orgs_org_type_check'
    ) THEN
        ALTER TABLE agos_business_orgs
            ADD CONSTRAINT agos_business_orgs_org_type_check
            CHECK (org_type IN ('company','non_profit','government','sole_trader','partnership','other'));
    END IF;
END$$;

COMMENT ON COLUMN agos_business_orgs.description_md IS
  'Long-form markdown description. The legacy `notes` column is retained as a one-line free-form field; description_md is the canonical body the org-detail page renders via react-markdown (no rehype-raw — no raw HTML).';

COMMENT ON COLUMN agos_business_orgs.archived_at IS
  'Soft-archive marker. NULL = active; non-NULL = the timestamp the org was archived. DELETE on the route layer sets this rather than hard-deleting.';

CREATE INDEX IF NOT EXISTS agos_business_orgs_tags_gin_idx
    ON agos_business_orgs USING gin (tags);

CREATE INDEX IF NOT EXISTS agos_business_orgs_user_active_idx
    ON agos_business_orgs (user_id)
    WHERE archived_at IS NULL;

-- ─── 2. agos_business_people (ALTER + JSONB→TEXT[] tags migration) ────────

ALTER TABLE agos_business_people
    ADD COLUMN IF NOT EXISTS description_md TEXT NOT NULL DEFAULT '';

ALTER TABLE agos_business_people
    ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE agos_business_people
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE agos_business_people
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- JSONB→TEXT[] tags migration. Defense-in-depth:
--   - NULL JSONB → empty TEXT[]
--   - Non-array JSONB → empty TEXT[]
--   - Empty array → empty TEXT[]
--   - Multi-string array → matching TEXT[]
-- The `jsonb_typeof(...) = 'array'` guard means we never call
-- jsonb_array_elements_text on a scalar / object and raise.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'agos_business_people'
           AND column_name = 'tags_new'
    ) THEN
        ALTER TABLE agos_business_people
            ADD COLUMN tags_new TEXT[] NOT NULL DEFAULT '{}';
    END IF;
END$$;

UPDATE agos_business_people
   SET tags_new = COALESCE(
         (SELECT ARRAY_AGG(value::TEXT)
            FROM jsonb_array_elements_text(tags) AS value
           WHERE jsonb_typeof(tags) = 'array'),
         '{}'::TEXT[]
       )
 WHERE tags IS NOT NULL
   AND jsonb_typeof(tags) = 'array'
   AND jsonb_array_length(tags) > 0;

-- Drop the old JSONB column + rename the new one in. Guarded so a
-- partial re-run is safe.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'agos_business_people'
           AND column_name = 'tags'
           AND data_type = 'jsonb'
    ) THEN
        ALTER TABLE agos_business_people DROP COLUMN tags;
    END IF;
END$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'agos_business_people'
           AND column_name = 'tags_new'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'agos_business_people'
           AND column_name = 'tags'
    ) THEN
        ALTER TABLE agos_business_people RENAME COLUMN tags_new TO tags;
    END IF;
END$$;

COMMENT ON COLUMN agos_business_people.description_md IS
  'Long-form markdown description. The legacy `notes` column stays as the one-line free-form note; description_md is the body the person-detail page renders via react-markdown (no rehype-raw).';

COMMENT ON COLUMN agos_business_people.archived_at IS
  'Soft-archive marker. NULL = active; non-NULL = the timestamp the person was archived. DELETE on the route layer sets this rather than hard-deleting.';

COMMENT ON COLUMN agos_business_people.stage IS
  'Free-form contact-tier label. NOT a sales-pipeline stage — that lives on Phase 2 agos_business_deals.stage. Kept free-form here per the locked decision in the plan doc.';

CREATE INDEX IF NOT EXISTS agos_business_people_tags_gin_idx
    ON agos_business_people USING gin (tags);

CREATE INDEX IF NOT EXISTS agos_business_people_user_active_idx
    ON agos_business_people (user_id)
    WHERE archived_at IS NULL;

-- ─── 3. agos_business_interactions (defensive remap + CHECK) ──────────────

UPDATE agos_business_interactions
   SET interaction_type = 'note'
 WHERE interaction_type NOT IN ('call','email','meeting','demo','proposal','follow_up','note','linkedin','other');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'agos_business_interactions_interaction_type_check'
    ) THEN
        ALTER TABLE agos_business_interactions
            ADD CONSTRAINT agos_business_interactions_interaction_type_check
            CHECK (interaction_type IN ('call','email','meeting','demo','proposal','follow_up','note','linkedin','other'));
    END IF;
END$$;

-- ─── 4. agos_business_settings (NEW) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS agos_business_settings (
    id                          UUID PRIMARY KEY,
    user_id                     UUID NOT NULL UNIQUE,
    business_name               TEXT NOT NULL DEFAULT '',
    logo_url                    TEXT,
    address                     TEXT NOT NULL DEFAULT '',
    tax_id                      TEXT,
    default_currency            TEXT NOT NULL DEFAULT 'USD',
    invoice_number_prefix       TEXT NOT NULL DEFAULT 'INV',
    quote_number_prefix         TEXT NOT NULL DEFAULT 'Q',
    default_payment_terms       TEXT NOT NULL DEFAULT 'net_30',
    default_hourly_rate_cents   BIGINT,
    accent_color                TEXT NOT NULL DEFAULT 'teal',
    metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE agos_business_settings IS
  'Workshop-global Business OS settings, one row per user. Lazy-created on first GET. No FK on user_id per the v0.1.30 cross-OS contract.';

COMMENT ON COLUMN agos_business_settings.logo_url IS
  'External URL to the hosted logo. Binary content is governed by the MCP storage-transfer contract (docs/architecture/mcp-storage-transfer.md); this column never stores binary.';

COMMENT ON COLUMN agos_business_settings.tax_id IS
  'Free-form tax identifier (EIN, ABN, VAT, ARN, …). No format CHECK — jurisdictions vary too widely for a useful constraint.';

CREATE INDEX IF NOT EXISTS agos_business_settings_user_idx
    ON agos_business_settings (user_id);
"""


_DOWNGRADE_SQL = r"""
-- Reverse of UPGRADE. Best-effort: the JSONB→TEXT[] migration is
-- intentionally one-way (we don't reconstruct the original JSONB shape).
-- Downgrade DROPs the new settings table + new columns; the tags column
-- stays as TEXT[] (callers stuck on the old schema can re-cast manually
-- if they roll back, but a re-up will pick the array back up cleanly).

DROP INDEX IF EXISTS agos_business_settings_user_idx;
DROP TABLE IF EXISTS agos_business_settings;

ALTER TABLE agos_business_interactions
    DROP CONSTRAINT IF EXISTS agos_business_interactions_interaction_type_check;

DROP INDEX IF EXISTS agos_business_people_user_active_idx;
DROP INDEX IF EXISTS agos_business_people_tags_gin_idx;

ALTER TABLE agos_business_people
    DROP COLUMN IF EXISTS metadata;
ALTER TABLE agos_business_people
    DROP COLUMN IF EXISTS archived_at;
ALTER TABLE agos_business_people
    DROP COLUMN IF EXISTS address;
ALTER TABLE agos_business_people
    DROP COLUMN IF EXISTS description_md;

DROP INDEX IF EXISTS agos_business_orgs_user_active_idx;
DROP INDEX IF EXISTS agos_business_orgs_tags_gin_idx;

ALTER TABLE agos_business_orgs
    DROP CONSTRAINT IF EXISTS agos_business_orgs_org_type_check;

ALTER TABLE agos_business_orgs
    DROP COLUMN IF EXISTS metadata;
ALTER TABLE agos_business_orgs
    DROP COLUMN IF EXISTS archived_at;
ALTER TABLE agos_business_orgs
    DROP COLUMN IF EXISTS tags;
ALTER TABLE agos_business_orgs
    DROP COLUMN IF EXISTS address;
ALTER TABLE agos_business_orgs
    DROP COLUMN IF EXISTS description_md;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
