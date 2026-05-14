"""Shared primitives — server-side persistence for the ``SavedViews`` UI.

Revision ID: 0070_shared_saved_views
Revises: 0069_business_deals_archived_at
Create Date: 2026-05-14

The shared ``SavedViews`` data-view primitive (Wave B.2,
``components/agentic-os/_shared/views/saved-views.tsx``) is pure
props-in / callbacks-out: persistence is the caller's job. Until now the
only persistence layer was the per-surface localStorage mock at
``lib/agentic-os/research/saved-views-store.ts`` (known ``_shared/views``
gap #2). Wave E schema-backs it with a real cross-OS table so saved
views survive across devices and browsers.

Schema delta
------------

1. ``agos_shared_saved_views`` (NEW — cross-OS, one row per saved view)
     - ``id UUID PK``
     - ``user_id UUID NOT NULL`` — owner. No FK per the v0.1.30 cross-OS
       contract; ownership is enforced at the BFF / repo layer.
     - ``entity_kind TEXT NOT NULL`` — which OS entity list the view
       applies to (e.g. ``research:hypotheses``, ``blockers``). The repo
       scopes every read / write by ``(user_id, entity_kind)``. Free-form
       — no CHECK; each surface owns its own stable key and the set of
       keys grows as new OS list pages adopt the primitive.
     - ``name TEXT NOT NULL`` — human label rendered in the pill.
     - ``query JSONB NOT NULL DEFAULT '{}'`` — the opaque serialized
       filter / sort / view state. The UI owns this shape; the table
       only round-trips it. No structural CHECK on purpose.
     - ``created_at`` / ``updated_at`` TIMESTAMPTZ NOT NULL DEFAULT now().
     - Index ``agos_shared_saved_views_user_entity_idx`` ON
       ``(user_id, entity_kind)`` — the sole access pattern is "list this
       user's views for this surface", so the composite index is exactly
       the feed query shape. ``created_at`` is appended so the index also
       serves the ORDER BY without a sort step.

Locked design decisions
-----------------------
- **No FK on ``user_id``.** Mirrors the v0.1.30 cross-OS contract — every
  other ``agos_*`` table dropped cross-OS UUID FKs; ownership lives at
  the BFF.
- **No CHECK on ``entity_kind``.** It is a surface-chosen stable string;
  constraining it here would force a migration every time a new list
  page adopts the primitive. The repo treats it as an opaque scope key.
- **No structural CHECK on ``query``.** The serialized view state is
  owned by the UI; the table is a dumb JSONB round-trip.
- **Hard delete, not soft.** Saved views are a convenience layer, not a
  system of record — DELETE removes the row outright (no ``archived_at``).

Idempotency
-----------
CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS guard
re-application. Safe to re-run on a partially-applied database.

Bind-marker safety
------------------
Per prior-phase footgun: SQLAlchemy's ``text()`` parses ``:word``
patterns as bind markers. This module uses ``op.execute`` with raw
string constants (NOT ``op.execute(text(...))``); the SQL bodies carry
zero ``:<word>`` patterns. The COMMENT bodies were written to avoid any
``:`` followed by a word character.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0070_shared_saved_views"
down_revision: Union[str, None] = "0069_business_deals_archived_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ─── 1. agos_shared_saved_views (NEW) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agos_shared_saved_views (
    id           UUID PRIMARY KEY,
    user_id      UUID NOT NULL,
    entity_kind  TEXT NOT NULL,
    name         TEXT NOT NULL,
    query        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE agos_shared_saved_views IS
  'Server-side persistence for the shared SavedViews UI primitive. One row per saved filter/sort preset, scoped by user_id plus entity_kind. Cross-OS — every list surface that adopts the primitive writes here. No FK on user_id per the v0.1.30 cross-OS contract.';

COMMENT ON COLUMN agos_shared_saved_views.entity_kind IS
  'Stable surface key picked by the adopting list page (research hypotheses, blockers, and so on). Free-form, no CHECK — the repo treats it as an opaque scope key alongside user_id.';

COMMENT ON COLUMN agos_shared_saved_views.query IS
  'Opaque serialized filter/sort/view state. The UI owns this shape; the table only round-trips it as JSONB. No structural CHECK on purpose.';

-- Sole access pattern: list one user's views for one surface, newest first.
-- Composite (user_id, entity_kind) matches the feed WHERE; created_at is
-- appended so the index also covers the ORDER BY.
CREATE INDEX IF NOT EXISTS agos_shared_saved_views_user_entity_idx
    ON agos_shared_saved_views (user_id, entity_kind, created_at);
"""


_DOWNGRADE_SQL = r"""
-- Reverse of UPGRADE in dependency order (index before table).

DROP INDEX IF EXISTS agos_shared_saved_views_user_entity_idx;

DROP TABLE IF EXISTS agos_shared_saved_views;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
