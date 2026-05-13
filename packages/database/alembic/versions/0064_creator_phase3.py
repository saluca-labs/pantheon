"""Creator OS Phase 3 — Book Writing.

Revision ID: 0064_creator_phase3
Revises: 0063_creator_phase2
Create Date: 2026-05-13

Phase 3 introduces long-form book writing with chapter management, word-count
tracking, drag-to-reorder, and Pandoc-based export to DOCX/PDF/ePub.

Schema delta
------------

1. ``agos_creator_books`` (NEW — book projects)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id TEXT NOT NULL`` (no FK — cross-OS contract)
     - ``title TEXT NOT NULL``
     - ``description TEXT``
     - ``cover_image_url TEXT``
     - ``status TEXT NOT NULL DEFAULT 'draft'`` CHECK (draft/writing/complete/published)
     - ``created_at``, ``updated_at``

2. ``agos_creator_chapters`` (NEW — book chapters)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``book_id UUID NOT NULL`` (no FK — referential handled at app layer)
     - ``title TEXT NOT NULL``
     - ``content JSONB NOT NULL DEFAULT '{}'`` (TipTap JSON)
     - ``order INT NOT NULL DEFAULT 0``
     - ``word_count INT NOT NULL DEFAULT 0``
     - ``status TEXT NOT NULL DEFAULT 'draft'`` CHECK (draft/revised/final)
     - ``created_at``, ``updated_at``

Indexes
-------
- ``idx_creator_books_user`` on (user_id, updated_at DESC) for list feeds.
- ``idx_creator_chapters_book`` on (book_id, "order") for ordered chapter queries.

Locked design decisions
-----------------------
- **No FK on user_id.** Ownership enforced at BFF route layer.
- **book_id has no FK.** Referential integrity handled at the application layer.
- **Content is TipTap JSON.** Stored directly in JSONB; no separate blocks table.
- **word_count is denormalized.** Written on save by the BFF; the chapter list
  query can return it without scanning JSONB content.

Idempotency
-----------
CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, and DO $$ guards on
triggers. Safe to re-run on a partially-applied database.

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


revision: str = "0064_creator_phase3"
down_revision: Union[str, None] = "0063_creator_phase2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ═══ agos_creator_books (NEW) ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_creator_books (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT         NOT NULL,
    title           TEXT         NOT NULL,
    description     TEXT         NULL,
    cover_image_url TEXT         NULL,
    status          TEXT         NOT NULL DEFAULT 'draft',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_creator_books_status_check
        CHECK (status IN ('draft', 'writing', 'complete', 'published'))
);

COMMENT ON TABLE agos_creator_books IS
  'Creator OS book projects. Each book owns a set of ordered chapters with TipTap JSON content. Supports status lifecycle tracking and Pandoc-based export.';

COMMENT ON COLUMN agos_creator_books.user_id IS
  'Owning user. No FK — ownership is enforced at the BFF route layer per the v0.1.30 cross-OS contract.';

COMMENT ON COLUMN agos_creator_books.title IS
  'Book title. Required, free-form text.';

COMMENT ON COLUMN agos_creator_books.description IS
  'Optional book description / synopsis.';

COMMENT ON COLUMN agos_creator_books.cover_image_url IS
  'URL to a cover image. URL-only contract — no file upload handling. Nullable.';

COMMENT ON COLUMN agos_creator_books.status IS
  'Book lifecycle status. CHECK-constrained: draft, writing, complete, published.';

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_creator_books_user
    ON agos_creator_books (user_id, updated_at DESC);

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
         WHERE tgname = 'trg_creator_books_updated_at'
    ) THEN
        CREATE TRIGGER trg_creator_books_updated_at
            BEFORE UPDATE ON agos_creator_books
            FOR EACH ROW
            EXECUTE FUNCTION agos_touch_updated_at();
    END IF;
END$$;


-- ═══ agos_creator_chapters (NEW) ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_creator_chapters (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id     UUID         NOT NULL,
    title       TEXT         NOT NULL,
    content     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    "order"     INT          NOT NULL DEFAULT 0,
    word_count  INT          NOT NULL DEFAULT 0,
    status      TEXT         NOT NULL DEFAULT 'draft',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_creator_chapters_status_check
        CHECK (status IN ('draft', 'revised', 'final'))
);

COMMENT ON TABLE agos_creator_chapters IS
  'Creator OS book chapters. Each chapter belongs to a book and stores its content as TipTap JSON. Order is maintained via the "order" column for drag-to-reorder support.';

COMMENT ON COLUMN agos_creator_chapters.book_id IS
  'Parent book. No FK — referential integrity handled at the application layer.';

COMMENT ON COLUMN agos_creator_chapters.title IS
  'Chapter title. Required.';

COMMENT ON COLUMN agos_creator_chapters.content IS
  'TipTap JSON document content. Stored directly in JSONB for flexible rich-text editing.';

COMMENT ON COLUMN agos_creator_chapters."order" IS
  'Sort order within the book. Lower values appear first. Updated via reorderChapters bulk operation.';

COMMENT ON COLUMN agos_creator_chapters.word_count IS
  'Denormalized word count. Written on save by the BFF to avoid scanning JSONB on every list query.';

COMMENT ON COLUMN agos_creator_chapters.status IS
  'Chapter revision status. CHECK-constrained: draft, revised, final.';

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_creator_chapters_book
    ON agos_creator_chapters (book_id, "order");

-- ─── updated_at trigger ───────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_creator_chapters_updated_at'
    ) THEN
        CREATE TRIGGER trg_creator_chapters_updated_at
            BEFORE UPDATE ON agos_creator_chapters
            FOR EACH ROW
            EXECUTE FUNCTION agos_touch_updated_at();
    END IF;
END$$;
"""


_DOWNGRADE_SQL = r"""
DROP TRIGGER IF EXISTS trg_creator_chapters_updated_at ON agos_creator_chapters;
DROP TABLE IF EXISTS agos_creator_chapters;
DROP TRIGGER IF EXISTS trg_creator_books_updated_at ON agos_creator_books;
DROP TABLE IF EXISTS agos_creator_books;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
