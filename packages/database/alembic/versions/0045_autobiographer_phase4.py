"""Autobiographer OS Phase 4 — chapters, revisions, and provenance.

Revision ID: 0045_autobiographer_phase4
Revises: 0044_autobiographer_phase3
Create Date: 2026-05-12

Phase 4 of Autobiographer OS introduces a first-class **chapter** entity
scoped to a book, with versioned **revisions** (so a ghostwritten draft
and the user's hand-edit live side by side), and a **provenance join**
mapping each chapter to the memory entries that sourced it. PDF export
ships per chapter and per book, composed on top of the OS-agnostic
``_shared/pdf/`` primitive (established by Filmmaker Phase 6, reused by
Cyber Phase 5 and Maker Phase 5).

The plan-doc anchor lives in
``apps/platform-web/content/agentic-os/autobiographer.md`` (Phase 4
section). The plan-doc still labels this migration ``0044_autobiographer_
phase4``; that numbering is stale because each Autobiographer phase has
shifted +1 since Research Phase 1 rebased into the band. The actual head
after Phase 3 is ``0044_autobiographer_phase3``, so this migration ships
as ``0045_autobiographer_phase4`` with ``down_revision =
0044_autobiographer_phase3``.

Legacy chapters rename + data backfill
--------------------------------------
The original ``agos_autobiographer_chapters`` table from migration
``0009_autobiographer_os`` is user-global and pre-dates the
books-as-projects model. Phase 4 promotes chapters to a book-scoped
entity, so the legacy table must yield the name.

Forward migration (one-way in practice; ``down()`` is reversible but
will lose any new book / revision / source data created post-upgrade):

  1. Rename ``agos_autobiographer_chapters`` to
     ``agos_autobiographer_chapters_legacy``. The existing
     ``agos_autobiographer_events`` table's FK to chapters is dropped
     and re-bound to the new book-scoped chapters table at the end of
     the data-migration pass.
  2. Create the three new tables (``agos_autobiographer_chapters``,
     ``agos_autobiographer_chapter_revisions``,
     ``agos_autobiographer_chapter_sources``).
  3. For each user that owns legacy chapter rows, ensure they have a
     book. If the user already has any ``agos_autobiographer_books``
     row, reuse the oldest one as the carry-over container. Otherwise
     create a single new book titled ``"Untitled"`` for the user.
     Books have no ``slug`` column today, so no per-user slug munging
     is needed for the carry-over book itself; the slug uniqueness
     contract only applies to the new chapters table.
  4. For each legacy chapter row (ordered by ``created_at`` within
     user) insert a corresponding new chapter row referencing the
     carry-over book, with ``position`` assigned 0, 1, 2, … in
     insertion order. ``slug`` is derived from the legacy ``title``
     with a per-book uniqueness suffix when collisions occur.
     ``status`` maps:
       - ``draft``     → ``drafting``
       - ``in_review`` → ``revised``
       - ``final``     → ``locked``
     ``summary`` carries the legacy ``period_label`` (verbatim).
  5. For every new chapter created in step (4) insert a corresponding
     ``agos_autobiographer_chapter_revisions`` row with
     ``version = 1``, ``author = 'user'``, the legacy ``body_text``,
     and ``word_count`` reused from the legacy row.
  6. Rebind the legacy ``agos_autobiographer_events`` table: drop the
     old FK to ``agos_autobiographer_chapters_legacy``, then add a
     new FK to the new ``agos_autobiographer_chapters(id)`` with
     ``ON DELETE CASCADE``. The legacy chapter UUID → new chapter UUID
     mapping built in step (4) is used to update ``events.chapter_id``
     in a single bulk UPDATE.

The legacy table is kept around as ``agos_autobiographer_chapters_legacy``
so a Phase 6 audit can still inspect the pre-migration prose. It is
NOT read by Phase 4 lib code.

UNIQUE (book_id, position) deferrable initially-deferred
--------------------------------------------------------
Reordering swaps positions in pairs (A=2, B=3 → A=3, B=2). With an
immediate UNIQUE constraint the intermediate state (both rows briefly
at the same number) would violate. Declaring the constraint
``DEFERRABLE INITIALLY DEFERRED`` lets a single transaction stage both
updates and validate at commit. The reorder repo helper wraps the swap
in a transaction so this works as expected.

coach_session_id is intentionally FK-less
-----------------------------------------
``chapter_revisions.coach_session_id`` is a nullable UUID with no FK
because the Phase 7 coach session table doesn't exist yet. Phase 7 can
add the FK without rewriting Phase 4 routes.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``,
``CREATE INDEX IF NOT EXISTS``, ``CREATE UNIQUE INDEX IF NOT EXISTS``).
The data-backfill steps run after the ``IF NOT EXISTS`` table creation
and are guarded by ``WHERE NOT EXISTS`` patterns so a re-run is a
no-op.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0045_autobiographer_phase4"
down_revision: Union[str, None] = "0044_autobiographer_phase3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. Rename the legacy chapters table out of the way. ---------------------
--
-- The IF EXISTS guard lets fresh installs (no legacy 0009 data) skip the
-- rename without failing. The events table's FK to the legacy chapters
-- table is dropped here too so it can be re-bound after the new chapters
-- table is in place.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename  = 'agos_autobiographer_chapters'
    )
    AND NOT EXISTS (
        SELECT 1
          FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename  = 'agos_autobiographer_chapters_legacy'
    ) THEN
        ALTER TABLE agos_autobiographer_chapters
            RENAME TO agos_autobiographer_chapters_legacy;
        -- The user index moves with the table; rename it for consistency.
        IF EXISTS (
            SELECT 1
              FROM pg_indexes
             WHERE schemaname = 'public'
               AND indexname  = 'agos_autobiographer_chapters_user_idx'
        ) THEN
            ALTER INDEX agos_autobiographer_chapters_user_idx
                RENAME TO agos_autobiographer_chapters_legacy_user_idx;
        END IF;
    END IF;
END$$;

-- Drop the events → legacy-chapters FK if it exists. We add the new FK
-- after the data backfill. The constraint name follows the autogenerated
-- pg_constraint convention.
DO $$
DECLARE
    fk_name TEXT;
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename  = 'agos_autobiographer_events'
    ) THEN
        SELECT conname INTO fk_name
          FROM pg_constraint
         WHERE conrelid = 'agos_autobiographer_events'::regclass
           AND contype  = 'f'
         LIMIT 1;
        IF fk_name IS NOT NULL THEN
            EXECUTE format(
                'ALTER TABLE agos_autobiographer_events DROP CONSTRAINT %I',
                fk_name
            );
        END IF;
    END IF;
END$$;

-- 2. New chapters table ---------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_chapters (
    id                  UUID        PRIMARY KEY,
    user_id             UUID        NOT NULL,
    book_id             UUID        NOT NULL
                                    REFERENCES agos_autobiographer_books(id)
                                    ON DELETE CASCADE,
    title               TEXT        NULL,
    slug                TEXT        NULL,
    position            INT         NOT NULL DEFAULT 0,
    status              TEXT        NOT NULL DEFAULT 'outline',
    summary             TEXT        NULL,
    target_word_count   INT         NULL,
    metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_autobiographer_chapters_status_chk
        CHECK (status IN ('outline','drafting','revised','locked'))
);

-- Per-book slug uniqueness. NULL slugs are allowed (the new-chapter
-- creator may defer slug assignment until the title settles); Postgres
-- treats NULLs as distinct in UNIQUE indexes by default, so multiple
-- chapters with NULL slug coexist within a book.
CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_chapters_book_slug_uq
    ON agos_autobiographer_chapters (book_id, slug);

-- Per-book position uniqueness, declared DEFERRABLE INITIALLY DEFERRED so
-- a swap-A-and-B reorder can stage both updates in one transaction. The
-- repo's `reorderChapter` wraps the swap accordingly.
CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_chapters_book_position_uq
    ON agos_autobiographer_chapters (book_id, position);

ALTER TABLE agos_autobiographer_chapters
    DROP CONSTRAINT IF EXISTS agos_autobiographer_chapters_book_position_uq_cn;

ALTER TABLE agos_autobiographer_chapters
    ADD CONSTRAINT agos_autobiographer_chapters_book_position_uq_cn
        UNIQUE USING INDEX agos_autobiographer_chapters_book_position_uq
        DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS agos_autobiographer_chapters_user_updated_idx
    ON agos_autobiographer_chapters (user_id, updated_at DESC);

COMMENT ON COLUMN agos_autobiographer_chapters.position IS
  'Default ordering within a book when no Phase 5 arc is selected. UNIQUE (book_id, position) is DEFERRABLE INITIALLY DEFERRED so reorder transactions can swap positions in one statement pair.';

COMMENT ON COLUMN agos_autobiographer_chapters.status IS
  'Lifecycle: outline -> drafting -> revised -> locked. CHECK enforces the four-state taxonomy.';

COMMENT ON COLUMN agos_autobiographer_chapters.summary IS
  'Short prose summary used by the chapter list, book-export PDF preamble, and Phase 5 arc preview.';

-- 3. Chapter revisions ----------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_chapter_revisions (
    id                  UUID        PRIMARY KEY,
    chapter_id          UUID        NOT NULL
                                    REFERENCES agos_autobiographer_chapters(id)
                                    ON DELETE CASCADE,
    user_id             UUID        NOT NULL,
    version             INT         NOT NULL,
    author              TEXT        NOT NULL DEFAULT 'user',
    body_text           TEXT        NOT NULL DEFAULT '',
    word_count          INT         NOT NULL DEFAULT 0,
    summary             TEXT        NULL,
    citations           JSONB       NOT NULL DEFAULT '[]'::jsonb,
    coach_session_id    UUID        NULL,
    metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_autobiographer_chapter_revisions_author_chk
        CHECK (author IN ('user','coach')),
    CONSTRAINT agos_autobiographer_chapter_revisions_version_chk
        CHECK (version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_chapter_revisions_chapter_version_uq
    ON agos_autobiographer_chapter_revisions (chapter_id, version);

CREATE INDEX IF NOT EXISTS agos_autobiographer_chapter_revisions_chapter_version_idx
    ON agos_autobiographer_chapter_revisions (chapter_id, version DESC);

COMMENT ON COLUMN agos_autobiographer_chapter_revisions.author IS
  'Author of this revision: user (hand-typed edit) or coach (ghostwriter-produced draft). CHECK enforces the two-value taxonomy.';

COMMENT ON COLUMN agos_autobiographer_chapter_revisions.citations IS
  'JSONB array of paragraph_index + memory_ids entries. Phase 4 PDF templates render paragraph-level footnotes from this column.';

COMMENT ON COLUMN agos_autobiographer_chapter_revisions.coach_session_id IS
  'Phase 7 coach session id when author = ''coach''. No FK because the session table is added later; Phase 7 may add the FK without rewriting Phase 4 routes.';

-- 4. Chapter sources (many-to-many provenance join) ----------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_chapter_sources (
    id          UUID    PRIMARY KEY,
    chapter_id  UUID    NOT NULL
                        REFERENCES agos_autobiographer_chapters(id)
                        ON DELETE CASCADE,
    memory_id   UUID    NOT NULL
                        REFERENCES agos_autobiographer_memories(id)
                        ON DELETE CASCADE,
    weight      REAL    NOT NULL DEFAULT 1.0,
    notes       TEXT    NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_chapter_sources_chapter_memory_uq
    ON agos_autobiographer_chapter_sources (chapter_id, memory_id);

CREATE INDEX IF NOT EXISTS agos_autobiographer_chapter_sources_chapter_idx
    ON agos_autobiographer_chapter_sources (chapter_id);

CREATE INDEX IF NOT EXISTS agos_autobiographer_chapter_sources_memory_idx
    ON agos_autobiographer_chapter_sources (memory_id);

COMMENT ON COLUMN agos_autobiographer_chapter_sources.weight IS
  'Provenance weight in [0..1] used by the Phase 7 chapter_drafter to prioritize source memories. Stored as REAL (single-precision) — display rounds to two decimals.';

-- 5. Data backfill from legacy chapters table ----------------------------
--
-- The DO block guards against double-execution: when the legacy table
-- does not exist (fresh install) the block is a no-op; when it does
-- exist but is already empty (re-run) the inserts are no-ops.

DO $$
DECLARE
    legacy_row       RECORD;
    new_chapter_id   UUID;
    new_revision_id  UUID;
    carryover_book   UUID;
    chosen_slug      TEXT;
    suffix           INT;
    next_position    INT;
    mapped_status    TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename  = 'agos_autobiographer_chapters_legacy'
    ) THEN
        RETURN;
    END IF;

    FOR legacy_row IN
        SELECT id, user_id, title, body_text, period_label, status, word_count, created_at
          FROM agos_autobiographer_chapters_legacy
         ORDER BY user_id, created_at ASC
    LOOP
        -- Skip if this legacy row already has a forward-migrated twin.
        IF EXISTS (
            SELECT 1
              FROM agos_autobiographer_chapters c
             WHERE c.metadata ->> 'legacy_chapter_id' = legacy_row.id::text
        ) THEN
            CONTINUE;
        END IF;

        -- Resolve the carry-over book for this user.
        SELECT id INTO carryover_book
          FROM agos_autobiographer_books
         WHERE user_id = legacy_row.user_id
         ORDER BY created_at ASC
         LIMIT 1;

        IF carryover_book IS NULL THEN
            carryover_book := gen_random_uuid();
            INSERT INTO agos_autobiographer_books
                (id, user_id, title, status, phase_progress, metadata)
            VALUES (
                carryover_book,
                legacy_row.user_id,
                'Untitled',
                'drafting',
                jsonb_build_object(
                    'drafting', 0,
                    'revising', 0,
                    'done',     0,
                    'paused',   0
                ),
                jsonb_build_object('phase4_carryover', true)
            );
        END IF;

        -- Resolve next position for this book.
        SELECT COALESCE(MAX(position) + 1, 0) INTO next_position
          FROM agos_autobiographer_chapters
         WHERE book_id = carryover_book;

        -- Pick a unique slug within the book. Derive from title via a
        -- conservative lowercase + hyphen replacement; fall back to
        -- "chapter-N" when title is empty.
        chosen_slug := regexp_replace(
            lower(coalesce(legacy_row.title, '')),
            '[^a-z0-9]+', '-', 'g'
        );
        chosen_slug := regexp_replace(chosen_slug, '^-+|-+$', '', 'g');
        IF chosen_slug = '' THEN
            chosen_slug := 'chapter-' || (next_position + 1);
        END IF;

        suffix := 1;
        WHILE EXISTS (
            SELECT 1
              FROM agos_autobiographer_chapters
             WHERE book_id = carryover_book
               AND slug    = chosen_slug
        ) LOOP
            suffix := suffix + 1;
            chosen_slug :=
                regexp_replace(
                    lower(coalesce(legacy_row.title, 'chapter')),
                    '[^a-z0-9]+', '-', 'g'
                )
                || '-' || suffix;
            chosen_slug := regexp_replace(chosen_slug, '^-+|-+$', '', 'g');
            IF chosen_slug = '' OR chosen_slug = '-' || suffix THEN
                chosen_slug := 'chapter-' || (next_position + 1) || '-' || suffix;
            END IF;
        END LOOP;

        -- Map legacy status to the Phase 4 four-value taxonomy.
        mapped_status := CASE legacy_row.status
            WHEN 'draft'     THEN 'drafting'
            WHEN 'in_review' THEN 'revised'
            WHEN 'final'     THEN 'locked'
            ELSE 'drafting'
        END;

        new_chapter_id := gen_random_uuid();
        INSERT INTO agos_autobiographer_chapters
            (id, user_id, book_id, title, slug, position, status,
             summary, metadata, created_at, updated_at)
        VALUES (
            new_chapter_id,
            legacy_row.user_id,
            carryover_book,
            coalesce(legacy_row.title, 'Untitled chapter'),
            chosen_slug,
            next_position,
            mapped_status,
            legacy_row.period_label,
            jsonb_build_object(
                'legacy_chapter_id', legacy_row.id::text,
                'phase4_backfill',  true
            ),
            legacy_row.created_at,
            legacy_row.created_at
        );

        -- Initial revision: legacy body_text as version 1, author 'user'.
        new_revision_id := gen_random_uuid();
        INSERT INTO agos_autobiographer_chapter_revisions
            (id, chapter_id, user_id, version, author, body_text,
             word_count, summary, citations, metadata, created_at)
        VALUES (
            new_revision_id,
            new_chapter_id,
            legacy_row.user_id,
            1,
            'user',
            coalesce(legacy_row.body_text, ''),
            coalesce(legacy_row.word_count, 0),
            legacy_row.period_label,
            '[]'::jsonb,
            jsonb_build_object('phase4_backfill', true),
            legacy_row.created_at
        );

        -- Rebind any events that pointed at the legacy chapter to the new
        -- chapter. The FK was dropped earlier; we rebind values directly.
        UPDATE agos_autobiographer_events
           SET chapter_id = new_chapter_id
         WHERE chapter_id = legacy_row.id;
    END LOOP;
END$$;

-- 6. Re-bind events.chapter_id FK to the new chapters table. -------------
--
-- The constraint is only added when the events table exists. Idempotent
-- via NOT EXISTS in pg_constraint.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename  = 'agos_autobiographer_events'
    )
    AND NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'agos_autobiographer_events_chapter_fk'
    ) THEN
        ALTER TABLE agos_autobiographer_events
            ADD CONSTRAINT agos_autobiographer_events_chapter_fk
            FOREIGN KEY (chapter_id)
            REFERENCES agos_autobiographer_chapters(id)
            ON DELETE CASCADE;
    END IF;
END$$;
"""


_DOWNGRADE_SQL = r"""
-- Reverses the rename + drops the new tables.
--
-- NOTE: This downgrade WILL LOSE any chapters, revisions, sources, or
-- book rows created post-upgrade. The forward migration is one-way in
-- practice; down() exists for test reversibility and emergency rollback
-- within minutes of the deploy.

-- 1. Drop events FK to new chapters (if present).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'agos_autobiographer_events_chapter_fk'
    ) THEN
        ALTER TABLE agos_autobiographer_events
            DROP CONSTRAINT agos_autobiographer_events_chapter_fk;
    END IF;
END$$;

-- 2. Rebind events.chapter_id back to legacy IDs via metadata map.
DO $$
DECLARE
    backfilled_row RECORD;
    legacy_id      UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename  = 'agos_autobiographer_chapters_legacy'
    ) THEN
        RETURN;
    END IF;

    FOR backfilled_row IN
        SELECT id, metadata
          FROM agos_autobiographer_chapters
         WHERE metadata ? 'legacy_chapter_id'
    LOOP
        legacy_id := (backfilled_row.metadata ->> 'legacy_chapter_id')::uuid;
        UPDATE agos_autobiographer_events
           SET chapter_id = legacy_id
         WHERE chapter_id = backfilled_row.id;
    END LOOP;
END$$;

-- 3. Drop the new tables in dependency order.
DROP INDEX IF EXISTS agos_autobiographer_chapter_sources_memory_idx;
DROP INDEX IF EXISTS agos_autobiographer_chapter_sources_chapter_idx;
DROP INDEX IF EXISTS agos_autobiographer_chapter_sources_chapter_memory_uq;
DROP TABLE IF EXISTS agos_autobiographer_chapter_sources;

DROP INDEX IF EXISTS agos_autobiographer_chapter_revisions_chapter_version_idx;
DROP INDEX IF EXISTS agos_autobiographer_chapter_revisions_chapter_version_uq;
DROP TABLE IF EXISTS agos_autobiographer_chapter_revisions;

DROP INDEX IF EXISTS agos_autobiographer_chapters_user_updated_idx;
DROP INDEX IF EXISTS agos_autobiographer_chapters_book_slug_uq;
ALTER TABLE IF EXISTS agos_autobiographer_chapters
    DROP CONSTRAINT IF EXISTS agos_autobiographer_chapters_book_position_uq_cn;
DROP TABLE IF EXISTS agos_autobiographer_chapters;

-- 4. Restore the legacy chapters table name + restore the events FK.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename  = 'agos_autobiographer_chapters_legacy'
    ) THEN
        ALTER TABLE agos_autobiographer_chapters_legacy
            RENAME TO agos_autobiographer_chapters;
        IF EXISTS (
            SELECT 1 FROM pg_indexes
             WHERE schemaname = 'public'
               AND indexname  = 'agos_autobiographer_chapters_legacy_user_idx'
        ) THEN
            ALTER INDEX agos_autobiographer_chapters_legacy_user_idx
                RENAME TO agos_autobiographer_chapters_user_idx;
        END IF;
    END IF;
END$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename  = 'agos_autobiographer_events'
    )
    AND EXISTS (
        SELECT 1 FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename  = 'agos_autobiographer_chapters'
    )
    AND NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'agos_autobiographer_events'::regclass
           AND contype  = 'f'
    ) THEN
        ALTER TABLE agos_autobiographer_events
            ADD CONSTRAINT agos_autobiographer_events_chapter_id_fkey
            FOREIGN KEY (chapter_id)
            REFERENCES agos_autobiographer_chapters(id)
            ON DELETE CASCADE;
    END IF;
END$$;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
