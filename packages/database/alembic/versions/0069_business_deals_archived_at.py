"""Business OS — backfill ``archived_at`` on ``agos_business_deals``.

Revision ID: 0069_business_deals_archived_at
Revises: 0068_creator_phase7
Create Date: 2026-05-13

Phase 2 (0056_business_phase2) created ``agos_business_deals`` without an
``archived_at`` column even though the deals-repo layer at
``apps/platform-web/src/lib/agentic-os/business/deals-repo.ts`` (list filter
clauses ``WHERE archived_at IS NULL`` / ``WHERE archived_at IS NOT NULL``)
assumes one is present. The omission only surfaced once the Phase 4 smoke
matrix began exercising the deals list endpoint end-to-end — prior CI runs
skipped the smoke gate due to upstream Docker build failures.

Schema delta
------------

1. ``agos_business_deals`` (ALTER, additive only)
     - ADD COLUMN ``archived_at TIMESTAMPTZ`` nullable (soft-delete gate)
     - NEW partial index ``agos_business_deals_user_partial_idx``
       ON ``(user_id) WHERE archived_at IS NULL`` — mirrors the
       non-archived feed pattern used by Phase 3 projects
       (``agos_business_projects_user_active_partial_idx``) and Phase 4
       quotes (``agos_business_quotes_user_active_partial_idx``).

The existing 0056 indexes on ``agos_business_deals (user_id, ...)`` are kept
in place — ``agos_business_deals_user_stage_updated_idx`` is composite and
serves stage-filtered list queries; ``agos_business_deals_open_pipeline_idx``
is partial on ``stage NOT IN ('won','lost')`` and is orthogonal to the new
archived-state partial. The new index is purely additive.

Locked design decisions
-----------------------
- **archived_at semantics match Phase 3/4.** When set, the deal is considered
  archived and hidden from default feeds. Setting archived_at does NOT
  change ``stage`` — the two are independent (same contract as projects).
- **Partial index naming follows the Phase 3 ``_user_active_partial_idx``
  pattern but uses ``_user_partial_idx``** to match the deals-repo's
  unqualified non-archived list query (no other partial axis on this index).

Idempotency
-----------
ALTER TABLE … ADD COLUMN IF NOT EXISTS and CREATE INDEX IF NOT EXISTS guard
re-application. Safe to re-run on a partially-applied database.

Bind-marker safety
------------------
Per prior-phase footgun: SQLAlchemy's ``text()`` parses ``:word`` patterns
as bind markers. This module uses ``op.execute`` with raw string constants
(NOT ``op.execute(text(...))``); the SQL bodies carry zero ``:<word>``
patterns.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0069_business_deals_archived_at"
down_revision: Union[str, None] = "0068_creator_phase7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ─── 1. agos_business_deals (ALTER, additive only) ───────────────────────────

ALTER TABLE agos_business_deals
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN agos_business_deals.archived_at IS
  'Soft-delete timestamp. When set, the deal is considered archived and hidden from default feeds. Setting archived_at does NOT change stage — the two are independent (same contract as Phase 3 projects).';

-- Non-archived feed: all non-archived deals for a user (excludes soft-deleted)
CREATE INDEX IF NOT EXISTS agos_business_deals_user_partial_idx
    ON agos_business_deals (user_id)
    WHERE archived_at IS NULL;
"""


_DOWNGRADE_SQL = r"""
-- Reverse of UPGRADE in dependency order (index before column).

DROP INDEX IF EXISTS agos_business_deals_user_partial_idx;

ALTER TABLE agos_business_deals
    DROP COLUMN IF EXISTS archived_at;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
