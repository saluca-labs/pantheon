"""Creator OS — Book publishing metadata + per-platform targets.

Revision ID: 0072_creator_book_publishing
Revises: 0071_llm_available_models
Create Date: 2026-05-19

Adds the schema needed for publish-ready book exports (KDP paperback,
KDP ebook, Lulu, IngramSpark, generic ePub). The original Phase 3
schema only stored title / description / cover / status — none of the
print-or-distribution metadata that publishers require.

Schema delta
------------

1. ``agos_creator_books`` (EXTENDED — new optional columns):
     - ``subtitle TEXT``
     - ``author_display_name TEXT``      (separate from owning user_id)
     - ``copyright_year INT``
     - ``language TEXT NOT NULL DEFAULT 'en-US'``   (BCP-47 tag)
     - ``dedication TEXT``
     - ``about_author TEXT``
     - ``series_name TEXT``
     - ``series_position INT``

2. ``agos_creator_book_publishing_targets`` (NEW — one row per
   (book × platform × format) the author intends to publish to):
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``book_id UUID NOT NULL``         (no FK — app-layer ref)
     - ``platform TEXT NOT NULL``        CHECK (kdp_paperback / kdp_ebook /
                                          lulu_paperback / ingramspark_paperback /
                                          generic_epub)
     - ``format TEXT NOT NULL``          CHECK (paperback / hardcover / ebook)
     - ``trim_size TEXT``                (e.g. "6x9", "5x8", "8.5x11" — nullable
                                          for ebook targets)
     - ``isbn TEXT``                     (nullable — assigned only at publish-ready
                                          export. ISBN-13 format enforced at app layer.)
     - ``bisac_codes TEXT[] NOT NULL DEFAULT '{}'`` (e.g. ['COM051000', 'BUS020000'])
     - ``price_usd NUMERIC(10, 2)``      (nullable)
     - ``status TEXT NOT NULL DEFAULT 'draft'``  CHECK (draft / ready / uploaded /
                                                    published)
     - ``notes TEXT``
     - ``created_at``, ``updated_at``

Indexes
-------
- ``idx_creator_book_publishing_targets_book`` on (book_id, platform, format)
  for the per-book target list.

Locked design decisions
-----------------------
- **No FK on book_id.** Matches the Phase 3 contract: ownership + referential
  integrity enforced at the BFF layer.
- **ISBN is nullable.** Real-world flow: author opens a draft target with
  trim size + price first, then assigns an ISBN at publish-ready export. The
  pre-flight validator (added in a later PR) enforces ISBN presence when
  ``status='ready'`` or the export ``mode='publish_ready'``.
- **bisac_codes is TEXT[]** rather than a join table — codes are opaque
  identifiers, not entities; users may paste codes the bundled lookup doesn't
  know about. A normalized join table would force a sync process for an
  evolving BISAC list.
- **price_usd is NUMERIC(10,2)** — currency math, not float.
- **Status lifecycle:** draft → ready (passes pre-flight) → uploaded (user
  has uploaded the export to the platform) → published (live for sale).
  No automatic transitions; the UI promotes manually.
- **Unique constraint deferred.** Allowing duplicate (book, platform, format)
  rows lets the author keep historical attempts. Uniqueness, if needed, can
  be added later without a destructive migration.

Idempotency
-----------
ALTER TABLE … ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
CREATE INDEX IF NOT EXISTS, DO $$ guards on triggers. Safe to re-run.

Bind-marker safety
------------------
Per Phase 3 footgun, ``op.execute`` is called with raw string constants,
not via ``text(...)``. The SQL bodies carry zero ``:<word>`` patterns.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0072_creator_book_publishing"
down_revision: Union[str, None] = "0071_llm_available_models"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ═══ agos_creator_books — extend with publishing metadata ════════════════════

ALTER TABLE agos_creator_books
    ADD COLUMN IF NOT EXISTS subtitle             TEXT,
    ADD COLUMN IF NOT EXISTS author_display_name  TEXT,
    ADD COLUMN IF NOT EXISTS copyright_year       INT,
    ADD COLUMN IF NOT EXISTS language             TEXT NOT NULL DEFAULT 'en-US',
    ADD COLUMN IF NOT EXISTS dedication           TEXT,
    ADD COLUMN IF NOT EXISTS about_author         TEXT,
    ADD COLUMN IF NOT EXISTS series_name          TEXT,
    ADD COLUMN IF NOT EXISTS series_position      INT;

COMMENT ON COLUMN agos_creator_books.subtitle IS
  'Optional book subtitle. Used in title pages and ePub metadata.';

COMMENT ON COLUMN agos_creator_books.author_display_name IS
  'Public author name as it should appear on the book. Distinct from user_id so a single user can publish under multiple pen names without coupling identity.';

COMMENT ON COLUMN agos_creator_books.copyright_year IS
  'Copyright year for the copyright page. Defaults to nothing — author sets it before publish-ready export.';

COMMENT ON COLUMN agos_creator_books.language IS
  'BCP-47 language tag (e.g. en-US, es-MX). Used for ePub <dc:language> and PDF metadata.';

COMMENT ON COLUMN agos_creator_books.dedication IS
  'Free-form dedication text. Rendered in front matter if non-null.';

COMMENT ON COLUMN agos_creator_books.about_author IS
  'About-the-author blurb. Rendered in back matter if non-null.';

COMMENT ON COLUMN agos_creator_books.series_name IS
  'Optional series this book belongs to.';

COMMENT ON COLUMN agos_creator_books.series_position IS
  'Optional 1-based position within the series.';


-- ═══ agos_creator_book_publishing_targets (NEW) ═══════════════════════════════

CREATE TABLE IF NOT EXISTS agos_creator_book_publishing_targets (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id         UUID         NOT NULL,
    platform        TEXT         NOT NULL,
    format          TEXT         NOT NULL,
    trim_size       TEXT         NULL,
    isbn            TEXT         NULL,
    bisac_codes     TEXT[]       NOT NULL DEFAULT '{}',
    price_usd       NUMERIC(10, 2) NULL,
    status          TEXT         NOT NULL DEFAULT 'draft',
    notes           TEXT         NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_creator_book_publishing_targets_platform_check
        CHECK (platform IN (
            'kdp_paperback',
            'kdp_ebook',
            'lulu_paperback',
            'ingramspark_paperback',
            'generic_epub'
        )),

    CONSTRAINT agos_creator_book_publishing_targets_format_check
        CHECK (format IN ('paperback', 'hardcover', 'ebook')),

    CONSTRAINT agos_creator_book_publishing_targets_status_check
        CHECK (status IN ('draft', 'ready', 'uploaded', 'published'))
);

COMMENT ON TABLE agos_creator_book_publishing_targets IS
  'Per-(book × platform × format) publishing target. Stores trim size, ISBN, BISAC codes, price, and lifecycle status. The export pipeline consumes one of these rows to drive platform-specific pandoc/xelatex templates.';

COMMENT ON COLUMN agos_creator_book_publishing_targets.book_id IS
  'Parent book. No FK — referential integrity at the application layer.';

COMMENT ON COLUMN agos_creator_book_publishing_targets.platform IS
  'Publishing platform. CHECK-constrained: kdp_paperback, kdp_ebook, lulu_paperback, ingramspark_paperback, generic_epub.';

COMMENT ON COLUMN agos_creator_book_publishing_targets.format IS
  'Physical/digital format. CHECK-constrained: paperback, hardcover, ebook.';

COMMENT ON COLUMN agos_creator_book_publishing_targets.trim_size IS
  'Print trim size, e.g. "6x9", "5x8", "5.5x8.5", "8.5x11". Nullable for ebook targets where it does not apply.';

COMMENT ON COLUMN agos_creator_book_publishing_targets.isbn IS
  'ISBN-13 for this target. Nullable for draft targets — assigned at publish-ready export. Format validated at app layer (978/979 prefix + 13 digits + checksum).';

COMMENT ON COLUMN agos_creator_book_publishing_targets.bisac_codes IS
  'BISAC subject codes used for category placement (e.g. {COM051000, BUS020000}). Codes are opaque identifiers; the BISAC reference list is bundled in the UI as a picker but free-text values are accepted.';

COMMENT ON COLUMN agos_creator_book_publishing_targets.price_usd IS
  'List price in USD. NUMERIC(10,2) avoids float drift.';

COMMENT ON COLUMN agos_creator_book_publishing_targets.status IS
  'Target lifecycle. CHECK-constrained: draft (in progress), ready (passed pre-flight, ISBN assigned), uploaded (file sent to publisher), published (live for sale).';

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_creator_book_publishing_targets_book
    ON agos_creator_book_publishing_targets (book_id, platform, format);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
-- Reuses the shared agos_touch_updated_at() function defined in 0064.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_creator_book_publishing_targets_updated_at'
    ) THEN
        CREATE TRIGGER trg_creator_book_publishing_targets_updated_at
            BEFORE UPDATE ON agos_creator_book_publishing_targets
            FOR EACH ROW
            EXECUTE FUNCTION agos_touch_updated_at();
    END IF;
END$$;
"""


_DOWNGRADE_SQL = r"""
DROP TRIGGER IF EXISTS trg_creator_book_publishing_targets_updated_at
    ON agos_creator_book_publishing_targets;

DROP TABLE IF EXISTS agos_creator_book_publishing_targets;

ALTER TABLE agos_creator_books
    DROP COLUMN IF EXISTS subtitle,
    DROP COLUMN IF EXISTS author_display_name,
    DROP COLUMN IF EXISTS copyright_year,
    DROP COLUMN IF EXISTS language,
    DROP COLUMN IF EXISTS dedication,
    DROP COLUMN IF EXISTS about_author,
    DROP COLUMN IF EXISTS series_name,
    DROP COLUMN IF EXISTS series_position;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
