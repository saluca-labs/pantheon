"""Business OS Phase 2 — Deals, Pipeline, and Activities.

Revision ID: 0056_business_phase2
Revises: 0055_business_phase1
Create Date: 2026-05-12

Phase 2 promotes the free-form ``stage`` column on ``agos_business_people``
from a contact-state overload into a proper **deal** entity. A deal is an
open opportunity tied to a contact (and optionally an organization), with
its own pipeline stage, expected value, expected close date, and an activity
log. The existing ``agos_business_interactions`` table becomes the activity
log per deal by adding an optional ``deal_id`` column.

Schema delta
------------

1. ``agos_business_deals`` (NEW — opportunity records)
     - ``id UUID PK``, ``user_id UUID NOT NULL``
     - ``contact_id UUID`` nullable FK SET NULL → agos_business_people
     - ``organization_id UUID`` nullable FK SET NULL → agos_business_orgs
     - ``title TEXT NOT NULL``
     - ``description_md TEXT NOT NULL DEFAULT ''``
     - ``stage TEXT NOT NULL DEFAULT 'lead'`` with CHECK enforcing the 7
       canonical pipeline stages: lead / qualified / proposal / negotiation
       / won / lost / on_hold
     - ``value_cents BIGINT`` nullable (expected deal size in minor units)
     - ``currency TEXT NOT NULL DEFAULT 'USD'``
     - ``probability_pct INT NOT NULL DEFAULT 50`` CHECK 0-100 (forecast
       weight, user-entered — not stage-derived)
     - ``expected_close_date DATE`` nullable
     - ``closed_at TIMESTAMPTZ`` nullable (set when stage moves to won/lost)
     - ``lost_reason TEXT`` nullable
     - ``source TEXT`` nullable (free-form: referral / cold_outreach /
       inbound / linkedin / etc.)
     - ``tags TEXT[] NOT NULL DEFAULT '{}'``
     - ``metadata JSONB NOT NULL DEFAULT '{}'``, ``created_at``, ``updated_at``
     - 6 indexes: main list feed, contact lookup, org lookup, open-pipeline
       feed, closing-soon feed, GIN on tags

2. ``agos_business_interactions`` (ALTER, additive only)
     - ADD ``deal_id UUID`` nullable
     - Partial index ``(deal_id, occurred_at DESC) WHERE deal_id IS NOT NULL``

3. ``agos_business_people.stage`` — **deprecated, kept in place.** No
   migration or drop. The column becomes a free-form contact-tier label
   ("active / inactive / VIP"); the canonical sales pipeline lives on
   ``agos_business_deals.stage``.

Locked design decisions
-----------------------
- **Deal stages are CHECK-constrained** from day one (unlike the legacy
  people.stage which was unchecked free-form).
- **Probability is user-entered, not stage-derived.** No automatic mapping.
- **Forecast revenue is derived on-demand** (weighted_value_cents = value_cents
  * probability_pct / 100), not stored.
- **No FK on user_id.** Mirrors v0.1.30 cross-OS contract. Ownership enforced
  at the BFF route layer.
- **Within-OS FKs use ON DELETE SET NULL** for optional references
  (contact_id, organization_id) — deleting a contact or org unlinks but
  preserves the deal record.
- **Activity log writes against the existing agos_business_interactions table**
  via the new optional deal_id column.

Idempotency
-----------
CREATE TABLE IF NOT EXISTS, ALTER TABLE … ADD COLUMN IF NOT EXISTS (via
DO $$ guard on information_schema.columns), CREATE INDEX IF NOT EXISTS (via
DO $$ guard on pg_indexes). Safe to re-run on a partially-applied database.

Bind-marker safety
------------------
Per prior-phase footgun: SQLAlchemy's ``text()`` parses ``:word`` patterns
as bind markers. This module uses ``op.execute`` with raw string constants
(NOT ``op.execute(text(...))``); the SQL bodies carry zero ``:<word>``
patterns. The dollar-quoted ``DO $$`` blocks are PG-only and Alembic passes
the string through to the driver verbatim.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0056_business_phase2"
down_revision: Union[str, None] = "0055_business_phase1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ─── 1. agos_business_deals (NEW) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agos_business_deals (
    id                  UUID        PRIMARY KEY,
    user_id             UUID        NOT NULL,
    contact_id          UUID        NULL
                                    REFERENCES agos_business_people(id)
                                    ON DELETE SET NULL,
    organization_id     UUID        NULL
                                    REFERENCES agos_business_orgs(id)
                                    ON DELETE SET NULL,
    title               TEXT        NOT NULL,
    description_md      TEXT        NOT NULL DEFAULT '',
    stage               TEXT        NOT NULL DEFAULT 'lead',
    value_cents         BIGINT      NULL,
    currency            TEXT        NOT NULL DEFAULT 'USD',
    probability_pct     INT         NOT NULL DEFAULT 50,
    expected_close_date DATE        NULL,
    closed_at           TIMESTAMPTZ NULL,
    lost_reason         TEXT        NULL,
    source              TEXT        NULL,
    tags                TEXT[]      NOT NULL DEFAULT '{}',
    metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT agos_business_deals_stage_check
        CHECK (stage IN ('lead','qualified','proposal','negotiation','won','lost','on_hold')),

    CONSTRAINT agos_business_deals_probability_check
        CHECK (probability_pct >= 0 AND probability_pct <= 100)
);

COMMENT ON TABLE agos_business_deals IS
  'Sales pipeline opportunities. Each deal is tied to a contact (and optionally an organization) with its own pipeline stage, expected value, close date, and activity log via agos_business_interactions.deal_id.';

COMMENT ON COLUMN agos_business_deals.user_id IS
  'Owning user. No FK — ownership is enforced at the BFF route layer per the v0.1.30 cross-OS contract.';

COMMENT ON COLUMN agos_business_deals.contact_id IS
  'Primary buyer-side contact. FK SET NULL on contact delete so the deal record survives.';

COMMENT ON COLUMN agos_business_deals.organization_id IS
  'Denormalized organization reference for filter performance. Defaults to the contact''s organization_id at creation but the user can override. FK SET NULL on org delete.';

COMMENT ON COLUMN agos_business_deals.stage IS
  'Current pipeline stage. CHECK-constrained from day one: lead → qualified → proposal → negotiation → won / lost. ``on_hold`` parks a deal without changing its probability. Stage transitions are audited via the stage convenience route.';

COMMENT ON COLUMN agos_business_deals.value_cents IS
  'Expected deal value in minor currency units (cents). Nullable — deals can be created without a value estimate.';

COMMENT ON COLUMN agos_business_deals.probability_pct IS
  'User-entered win probability (0-100). NOT stage-derived — solo founders adjust per deal. Forecast revenue is computed on-demand as value_cents * probability_pct / 100.';

COMMENT ON COLUMN agos_business_deals.expected_close_date IS
  'Target close date. Nullable. The closing-soon feed sorts deals by this column ascending.';

COMMENT ON COLUMN agos_business_deals.closed_at IS
  'Actual close timestamp. Set automatically when stage transitions to won or lost via the stage convenience route. NULL while the deal is open.';

COMMENT ON COLUMN agos_business_deals.lost_reason IS
  'Free-form loss reason. Populated when a deal is marked lost. Kept free-form — taxonomies vary too widely for a useful CHECK.';

COMMENT ON COLUMN agos_business_deals.source IS
  'Free-form acquisition channel (referral, cold_outreach, inbound, linkedin, etc.). No CHECK — users can invent their own channels.';

-- Indexes

-- Main list feed: user's deals sorted by recent activity within each stage
CREATE INDEX IF NOT EXISTS agos_business_deals_user_stage_updated_idx
    ON agos_business_deals (user_id, stage, updated_at DESC);

-- Lookup by contact (only for deals that have a contact assigned)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_deals_contact_partial_idx'
    ) THEN
        CREATE INDEX agos_business_deals_contact_partial_idx
            ON agos_business_deals (contact_id)
            WHERE contact_id IS NOT NULL;
    END IF;
END$$;

-- Lookup by organization
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_deals_org_partial_idx'
    ) THEN
        CREATE INDEX agos_business_deals_org_partial_idx
            ON agos_business_deals (organization_id)
            WHERE organization_id IS NOT NULL;
    END IF;
END$$;

-- Open-pipeline feed: deals that are still active (exclude won/lost)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_deals_open_pipeline_idx'
    ) THEN
        CREATE INDEX agos_business_deals_open_pipeline_idx
            ON agos_business_deals (user_id)
            WHERE stage NOT IN ('won', 'lost');
    END IF;
END$$;

-- Closing-soon feed: open deals sorted by expected close date
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_deals_closing_soon_idx'
    ) THEN
        CREATE INDEX agos_business_deals_closing_soon_idx
            ON agos_business_deals (user_id, expected_close_date ASC)
            WHERE stage NOT IN ('won', 'lost')
              AND expected_close_date IS NOT NULL;
    END IF;
END$$;

-- Tag search
CREATE INDEX IF NOT EXISTS agos_business_deals_tags_gin_idx
    ON agos_business_deals USING gin (tags);

-- ─── 2. agos_business_interactions (ALTER) ───────────────────────────────────

-- Add optional deal_id column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'agos_business_interactions'
           AND column_name = 'deal_id'
    ) THEN
        ALTER TABLE agos_business_interactions
            ADD COLUMN deal_id UUID NULL;
    END IF;
END$$;

COMMENT ON COLUMN agos_business_interactions.deal_id IS
  'Optional link to a deal. When set, the interaction appears on the deal detail activity timeline. NULL = contact/org-scoped interaction (legacy behavior). No FK — cross-table referential integrity is enforced at the route layer.';

-- Partial index for deal-scoped activity timeline
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'agos_business_interactions_deal_occurred_idx'
    ) THEN
        CREATE INDEX agos_business_interactions_deal_occurred_idx
            ON agos_business_interactions (deal_id, occurred_at DESC)
            WHERE deal_id IS NOT NULL;
    END IF;
END$$;
"""


_DOWNGRADE_SQL = r"""
-- Reverse of UPGRADE in dependency order (indexes before columns before tables).

DROP INDEX IF EXISTS agos_business_interactions_deal_occurred_idx;

ALTER TABLE agos_business_interactions
    DROP COLUMN IF EXISTS deal_id;

DROP INDEX IF EXISTS agos_business_deals_tags_gin_idx;
DROP INDEX IF EXISTS agos_business_deals_closing_soon_idx;
DROP INDEX IF EXISTS agos_business_deals_open_pipeline_idx;
DROP INDEX IF EXISTS agos_business_deals_org_partial_idx;
DROP INDEX IF EXISTS agos_business_deals_contact_partial_idx;
DROP INDEX IF EXISTS agos_business_deals_user_stage_updated_idx;

DROP TABLE IF EXISTS agos_business_deals;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
