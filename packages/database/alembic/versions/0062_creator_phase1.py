"""Creator OS Phase 1 — Content Hub + Notes Workspace.

Revision ID: 0062_creator_phase1
Revises: 0061_business_phase7
Create Date: 2026-05-13

Phase 1 introduces the creator notes workspace with a nested tree structure,
TipTap JSON content storage, and a shared updated_at trigger.

Schema delta
------------

1. ``agos_creator_notes`` (NEW — notes workspace)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id TEXT NOT NULL`` (no FK — cross-OS contract)
     - ``title TEXT NOT NULL DEFAULT 'Untitled'``
     - ``content JSONB NOT NULL DEFAULT '{}'`` (TipTap JSON)
     - ``icon TEXT`` (emoji char)
     - ``cover_image_url TEXT``
     - ``parent_id UUID`` (self-referential, no FK)
     - ``position INT NOT NULL DEFAULT 0``
     - ``tags TEXT[] NOT NULL DEFAULT '{}'``
     - ``is_pinned BOOLEAN NOT NULL DEFAULT false``
     - ``archived_at TIMESTAMPTZ``
     - ``created_at``, ``updated_at``

Indexes
-------
- ``idx_creator_notes_user`` on (user_id, updated_at DESC) for list feeds.
- ``idx_creator_notes_pinned`` partial WHERE is_pinned = true.
- ``idx_creator_notes_active`` partial WHERE archived_at IS NULL.
- ``idx_creator_notes_parent`` on (parent_id) for tree queries.

Locked design decisions
-----------------------
- **No FK on user_id.** Ownership enforced at BFF route layer.
- **parent_id has no FK.** Self-referential; orphans handled at app layer.
- **Content is TipTap JSON.** Stored directly in JSONB; no separate blocks table.
- **Icon is a single emoji char.** No icon picker library needed at v1.

Idempotency
-----------
CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS (for non-partial
indexes), and DO $$ guard on pg_indexes (for partial indexes). Safe to re-run
on a partially-applied database.

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


revision: str = "0062_creator_phase1"
down_revision: Union[str, None] = "0061_business_phase7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ═══ agos_creator_notes (NEW) ═════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_creator_notes (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT         NOT NULL,
    title           TEXT         NOT NULL DEFAULT 'Untitled',
    content         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    icon            TEXT         NULL,
    cover_image_url TEXT         NULL,
    parent_id       UUID         NULL,
    position        INT          NOT NULL DEFAULT 0,
    tags            TEXT[]       NOT NULL DEFAULT '{}',
    is_pinned       BOOLEAN      NOT NULL DEFAULT false,
    archived_at     TIMESTAMPTZ  NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE agos_creator_notes IS
  'Creator OS notes workspace. Supports nested tree structure via parent_id, TipTap JSON content, emoji icons, cover images, tags, pinning, and archiving.';

COMMENT ON COLUMN agos_creator_notes.user_id IS
  'Owning user. No FK — ownership is enforced at the BFF route layer per the v0.1.30 cross-OS contract.';

COMMENT ON COLUMN agos_creator_notes.title IS
  'Note title. Defaults to ''Untitled''.';

COMMENT ON COLUMN agos_creator_notes.content IS
  'TipTap JSON document content. Stored directly in JSONB for flexible rich-text editing without a separate blocks table.';

COMMENT ON COLUMN agos_creator_notes.icon IS
  'Single emoji character for visual identification in the sidebar tree and hub cards. Nullable.';

COMMENT ON COLUMN agos_creator_notes.cover_image_url IS
  'URL to a cover image. URL-only contract — no file upload handling in this phase. Nullable.';

COMMENT ON COLUMN agos_creator_notes.parent_id IS
  'Self-referential parent note for tree nesting. No FK — orphans are handled at the application layer. NULL for root-level notes.';

COMMENT ON COLUMN agos_creator_notes.position IS
  'Manual sort position within the parent''s children. Lower values appear first. Default 0.';

COMMENT ON COLUMN agos_creator_notes.tags IS
  'Free-form tag array for filtering and grouping.';

COMMENT ON COLUMN agos_creator_notes.is_pinned IS
  'Whether the note is pinned to the hub. Pinned notes appear in the pinned grid on the Creator Hub landing page.';

COMMENT ON COLUMN agos_creator_notes.archived_at IS
  'Soft-delete timestamp. NULL means active. Set to now() on archive, cleared on restore.';

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Main list feed: user's notes sorted by recent activity
CREATE INDEX IF NOT EXISTS idx_creator_notes_user
    ON agos_creator_notes (user_id, updated_at DESC);

-- Pinned notes lookup (only for pinned rows)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'idx_creator_notes_pinned'
    ) THEN
        CREATE INDEX idx_creator_notes_pinned
            ON agos_creator_notes (user_id, updated_at DESC)
            WHERE is_pinned = true;
    END IF;
END$$;

-- Active notes lookup (only non-archived rows)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'idx_creator_notes_active'
    ) THEN
        CREATE INDEX idx_creator_notes_active
            ON agos_creator_notes (user_id, updated_at DESC)
            WHERE archived_at IS NULL;
    END IF;
END$$;

-- Tree queries: find children of a parent note
CREATE INDEX IF NOT EXISTS idx_creator_notes_parent
    ON agos_creator_notes (parent_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION agos_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_creator_notes_updated_at'
    ) THEN
        CREATE TRIGGER trg_creator_notes_updated_at
            BEFORE UPDATE ON agos_creator_notes
            FOR EACH ROW
            EXECUTE FUNCTION agos_touch_updated_at();
    END IF;
END$$;
"""


_DOWNGRADE_SQL = r"""
DROP TRIGGER IF EXISTS trg_creator_notes_updated_at ON agos_creator_notes;
DROP TABLE IF EXISTS agos_creator_notes;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
