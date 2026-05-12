"""Autobiographer OS Phase 5 — themes, arcs, and timeline.

Revision ID: 0046_autobiographer_phase5
Revises: 0045_autobiographer_phase4
Create Date: 2026-05-12

Phase 5 of Autobiographer OS introduces **themes** (workshop-global tags
applied to memories and chapters), **arcs** (per-book chapter orderings),
and the timeline composite the new dashboard page consumes. The plan-doc
anchor lives in ``apps/platform-web/content/agentic-os/autobiographer.md``
(Phase 5 section). The plan-doc still labels this migration ``0045_
autobiographer_phase5``; that numbering is stale because each
Autobiographer phase has shifted +1 since Research Phase 1 rebased into
the band. The actual head after Phase 4 is ``0045_autobiographer_phase4``,
so this migration ships as ``0046_autobiographer_phase5`` with
``down_revision = 0045_autobiographer_phase4``.

New tables (all under ``agos_autobiographer_*``)::

    agos_autobiographer_themes          -- workshop-global theme tags
    agos_autobiographer_memory_themes   -- N:M memories ↔ themes
    agos_autobiographer_chapter_themes  -- N:M (book-scoped) chapters ↔ themes
    agos_autobiographer_arcs            -- per-book chapter ordering
    agos_autobiographer_arc_chapters    -- ordered chapter membership in an arc

Themes scoping decision — workshop-global
-----------------------------------------
A theme (``loss``, ``immigration``, ``music``) crosses book boundaries the
same way people do: the same theme can appear in multiple books. The
``user_id`` filter on every read enforces tenant isolation; the route
layer double-validates ownership at link time.

Per-user uniqueness is enforced on two columns to prevent silent dupes:

  - ``(user_id, slug)`` — exact slug match, unique index
  - ``(user_id, lower(name))`` — case-insensitive name match, functional
    unique index (mirrors the people-table pattern)

Arcs is_primary single-active invariant
---------------------------------------
At most one arc per book may have ``is_primary = true``. The constraint
is a partial unique index on ``(book_id) WHERE is_primary = true``. The
route layer flips ``is_primary = true`` on a target arc inside a
transaction that first clears the bit on every other arc for the book;
the partial index then admits the new winner.

This mirrors the Phase 3 voice-profile ``is_active`` pattern.

Arc-chapters ordering — DEFERRABLE INITIALLY DEFERRED
-----------------------------------------------------
``(arc_id, position)`` is unique per arc, declared DEFERRABLE INITIALLY
DEFERRED so a reorder transaction can stage all per-row updates and let
PG validate at commit. Mirrors Phase 4's chapter-position pattern.

``(arc_id, chapter_id)`` is also unique so a chapter never appears twice
in the same arc.

Cross-book chapter rejection is enforced at the route + repo layer; the
schema cannot express "arc.book_id MUST match chapter.book_id" without a
CHECK against a foreign column, which Postgres doesn't allow inline.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``,
``CREATE INDEX IF NOT EXISTS``, ``CREATE UNIQUE INDEX IF NOT EXISTS``).

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0046_autobiographer_phase5"
down_revision: Union[str, None] = "0045_autobiographer_phase4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. agos_autobiographer_themes -------------------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_themes (
    id            UUID        PRIMARY KEY,
    user_id       UUID        NOT NULL,
    name          TEXT        NOT NULL,
    slug          TEXT        NOT NULL,
    description   TEXT        NULL,
    color         TEXT        NULL,
    metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Slug uniqueness per user.
CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_themes_user_slug_uq
    ON agos_autobiographer_themes (user_id, slug);

-- Case-insensitive name uniqueness per user (functional index).
CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_themes_user_name_uq
    ON agos_autobiographer_themes (user_id, lower(name));

CREATE INDEX IF NOT EXISTS agos_autobiographer_themes_user_updated_idx
    ON agos_autobiographer_themes (user_id, updated_at DESC);

COMMENT ON COLUMN agos_autobiographer_themes.color IS
  'Tailwind accent name (indigo/teal/rose/...) used by the picker chip background. Phase 5 keeps this free-form; Phase 6 may add a CHECK.';

COMMENT ON COLUMN agos_autobiographer_themes.slug IS
  'URL-safe lowercase kebab. Unique per user (case-sensitive); the case-insensitive name index sits alongside.';

-- 2. agos_autobiographer_memory_themes ------------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_memory_themes (
    memory_id  UUID NOT NULL
               REFERENCES agos_autobiographer_memories(id) ON DELETE CASCADE,
    theme_id   UUID NOT NULL
               REFERENCES agos_autobiographer_themes(id)   ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (memory_id, theme_id)
);

CREATE INDEX IF NOT EXISTS agos_autobiographer_memory_themes_theme_idx
    ON agos_autobiographer_memory_themes (theme_id);

-- 3. agos_autobiographer_chapter_themes -----------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_chapter_themes (
    chapter_id UUID NOT NULL
               REFERENCES agos_autobiographer_chapters(id) ON DELETE CASCADE,
    theme_id   UUID NOT NULL
               REFERENCES agos_autobiographer_themes(id)   ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chapter_id, theme_id)
);

CREATE INDEX IF NOT EXISTS agos_autobiographer_chapter_themes_theme_idx
    ON agos_autobiographer_chapter_themes (theme_id);

-- 4. agos_autobiographer_arcs --------------------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_arcs (
    id          UUID        PRIMARY KEY,
    user_id     UUID        NOT NULL,
    book_id     UUID        NOT NULL
                            REFERENCES agos_autobiographer_books(id)
                            ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    kind        TEXT        NOT NULL DEFAULT 'chronological',
    description TEXT        NULL,
    is_primary  BOOLEAN     NOT NULL DEFAULT false,
    metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_autobiographer_arcs_kind_chk
        CHECK (kind IN ('chronological','thematic','character_led','custom'))
);

-- At most one primary arc per book — partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_arcs_book_primary_uq
    ON agos_autobiographer_arcs (book_id) WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS agos_autobiographer_arcs_book_idx
    ON agos_autobiographer_arcs (book_id);

CREATE INDEX IF NOT EXISTS agos_autobiographer_arcs_user_updated_idx
    ON agos_autobiographer_arcs (user_id, updated_at DESC);

COMMENT ON COLUMN agos_autobiographer_arcs.kind IS
  'One of chronological/thematic/character_led/custom. CHECK enforces membership; the route layer renders the human label.';

COMMENT ON COLUMN agos_autobiographer_arcs.is_primary IS
  'At most one primary arc per book (partial UNIQUE index). The book PDF export and book detail page prefer the primary arc when present, falling back to chapter position.';

-- 5. agos_autobiographer_arc_chapters ------------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_arc_chapters (
    id         UUID PRIMARY KEY,
    arc_id     UUID NOT NULL
               REFERENCES agos_autobiographer_arcs(id)     ON DELETE CASCADE,
    chapter_id UUID NOT NULL
               REFERENCES agos_autobiographer_chapters(id) ON DELETE CASCADE,
    position   INT  NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A chapter is at most once in a given arc.
CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_arc_chapters_arc_chapter_uq
    ON agos_autobiographer_arc_chapters (arc_id, chapter_id);

-- Per-arc position uniqueness, DEFERRABLE INITIALLY DEFERRED so a bulk
-- reorder transaction can stage all the new positions before commit.
CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_arc_chapters_arc_position_uq
    ON agos_autobiographer_arc_chapters (arc_id, position);

ALTER TABLE agos_autobiographer_arc_chapters
    DROP CONSTRAINT IF EXISTS agos_autobiographer_arc_chapters_arc_position_uq_cn;

ALTER TABLE agos_autobiographer_arc_chapters
    ADD CONSTRAINT agos_autobiographer_arc_chapters_arc_position_uq_cn
        UNIQUE USING INDEX agos_autobiographer_arc_chapters_arc_position_uq
        DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS agos_autobiographer_arc_chapters_arc_position_idx
    ON agos_autobiographer_arc_chapters (arc_id, position);

CREATE INDEX IF NOT EXISTS agos_autobiographer_arc_chapters_chapter_idx
    ON agos_autobiographer_arc_chapters (chapter_id);

COMMENT ON COLUMN agos_autobiographer_arc_chapters.position IS
  'Zero-based position within the arc. UNIQUE per arc, DEFERRABLE INITIALLY DEFERRED so reorder transactions can stage all writes before commit. Mirrors the chapter-position pattern from Phase 4.';
"""


_DOWNGRADE_SQL = r"""
-- Drop arc_chapters first (FK chains).
DROP INDEX IF EXISTS agos_autobiographer_arc_chapters_chapter_idx;
DROP INDEX IF EXISTS agos_autobiographer_arc_chapters_arc_position_idx;
ALTER TABLE IF EXISTS agos_autobiographer_arc_chapters
    DROP CONSTRAINT IF EXISTS agos_autobiographer_arc_chapters_arc_position_uq_cn;
DROP INDEX IF EXISTS agos_autobiographer_arc_chapters_arc_chapter_uq;
DROP TABLE IF EXISTS agos_autobiographer_arc_chapters;

DROP INDEX IF EXISTS agos_autobiographer_arcs_user_updated_idx;
DROP INDEX IF EXISTS agos_autobiographer_arcs_book_idx;
DROP INDEX IF EXISTS agos_autobiographer_arcs_book_primary_uq;
DROP TABLE IF EXISTS agos_autobiographer_arcs;

DROP INDEX IF EXISTS agos_autobiographer_chapter_themes_theme_idx;
DROP TABLE IF EXISTS agos_autobiographer_chapter_themes;

DROP INDEX IF EXISTS agos_autobiographer_memory_themes_theme_idx;
DROP TABLE IF EXISTS agos_autobiographer_memory_themes;

DROP INDEX IF EXISTS agos_autobiographer_themes_user_updated_idx;
DROP INDEX IF EXISTS agos_autobiographer_themes_user_name_uq;
DROP INDEX IF EXISTS agos_autobiographer_themes_user_slug_uq;
DROP TABLE IF EXISTS agos_autobiographer_themes;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
