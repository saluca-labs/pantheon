"""Autobiographer OS Phase 1 — books-as-projects + memory captures.

Revision ID: 0042_autobiographer_phase1
Revises: 0041_research_phase1
Create Date: 2026-05-11

Phase 1 of Autobiographer OS introduces the locked book-as-project model and
the workshop-global memory-captures layer. Plan is anchored in
``apps/platform-web/content/agentic-os/autobiographer.md`` (Phase 1 section).

New tables (all under ``agos_autobiographer_*``)::

    agos_autobiographer_books       -- per-user (per-OS project) container
    agos_autobiographer_memories    -- workshop-global memory captures

Legacy table handling
---------------------
The existing ``agos_autobiographer_chapters`` table (from migration
``0009_autobiographer_os``) stays in place. Phase 4 will introduce a new
``agos_autobiographer_chapters_v2`` table linked to
``agos_autobiographer_books(id)`` and migrate legacy data forward. This
Phase 1 migration deliberately does NOT drop or rename the legacy table —
the existing ``/dashboard/os/autobiographer/chapters`` page continues to
function while the new books + memories surfaces ship alongside it.

URL columns (MCP storage transfer contract)
-------------------------------------------
``cover_image_url`` (books), ``audio_url`` (memories), and ``photo_urls[]``
(memories) are URL-only — the platform never proxies bytes for these
assets. Column comments reference ``docs/architecture/mcp-storage-transfer.md``
to match the convention established by Maker Phase 1 and Filmmaker
``0021_filmmaker_project_meta``.

phase_progress shape
--------------------
Mirrors Maker Phase 1: a JSONB object whose keys are the lifecycle
statuses (drafting, revising, done, paused, archived), each holding an
integer 0-100 progress percentage. The column is required so back-filled
rows store an empty object rather than NULL.

memories.book_id is ON DELETE SET NULL
---------------------------------------
Memories are workshop-global captures by design — they survive book
deletion as detached entries rather than cascading away. This matches
the scoping decision in the Phase 1 plan: a memoirist may delete the
"draft executive bio" book and still want the underlying captures.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``, ``CREATE INDEX IF
NOT EXISTS``). Downgrade is reversible: drops both new tables in
dependency order.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0042_autobiographer_phase1"
down_revision: Union[str, None] = "0041_research_phase1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. agos_autobiographer_books --------------------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_books (
    id                     UUID        PRIMARY KEY,
    user_id                UUID        NOT NULL,
    title                  TEXT        NOT NULL,
    subtitle               TEXT        NULL,
    cover_image_url        TEXT        NULL,
    description            TEXT        NULL,
    status                 TEXT        NOT NULL DEFAULT 'drafting',
    target_completion_date DATE        NULL,
    target_audience        TEXT        NULL,
    tags                   TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    phase_progress         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    metadata               JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_autobiographer_books_status_chk
        CHECK (status IN ('drafting','revising','done','paused','archived'))
);

CREATE INDEX IF NOT EXISTS agos_autobiographer_books_user_status_idx
    ON agos_autobiographer_books (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS agos_autobiographer_books_tags_gin_idx
    ON agos_autobiographer_books USING GIN (tags);

COMMENT ON COLUMN agos_autobiographer_books.cover_image_url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_autobiographer_books.phase_progress IS
  'JSONB object: { drafting, revising, done, paused, archived } each int 0-100. Mirror of Maker Phase 1 shape.';

COMMENT ON COLUMN agos_autobiographer_books.metadata IS
  'Free-form per-book metadata. Reserved for forward-compatible flags.';

COMMENT ON COLUMN agos_autobiographer_books.target_audience IS
  'Free-form audience description ("family", "general public", "executive auto-bio for board members", etc.).';

-- 2. agos_autobiographer_memories -----------------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_memories (
    id                  UUID        PRIMARY KEY,
    user_id             UUID        NOT NULL,
    book_id             UUID        NULL
                                    REFERENCES agos_autobiographer_books(id)
                                    ON DELETE SET NULL,
    title               TEXT        NOT NULL,
    body_markdown       TEXT        NOT NULL,
    transcript          TEXT        NULL,
    audio_url           TEXT        NULL,
    photo_urls          TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    when_in_life        TEXT        NULL,
    era_date_estimate   DATE        NULL,
    location            TEXT        NULL,
    emotion_tags        TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    content_tags        TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    is_sensitive        BOOLEAN     NOT NULL DEFAULT false,
    source              TEXT        NOT NULL DEFAULT 'text',
    metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_autobiographer_memories_source_chk
        CHECK (source IN ('text','audio_transcript','photo_caption','import'))
);

CREATE INDEX IF NOT EXISTS agos_autobiographer_memories_user_idx
    ON agos_autobiographer_memories (user_id, updated_at DESC);

-- Partial index: per-book listings are common, only memories with a book_id
-- need to be on this index. Workshop-global memories (book_id IS NULL) hit
-- the user_idx above.
CREATE INDEX IF NOT EXISTS agos_autobiographer_memories_book_idx
    ON agos_autobiographer_memories (book_id, updated_at DESC)
    WHERE book_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agos_autobiographer_memories_content_tags_gin_idx
    ON agos_autobiographer_memories USING GIN (content_tags);

CREATE INDEX IF NOT EXISTS agos_autobiographer_memories_emotion_tags_gin_idx
    ON agos_autobiographer_memories USING GIN (emotion_tags);

-- Partial index for timeline ordering across all memories that carry a
-- structured era estimate.
CREATE INDEX IF NOT EXISTS agos_autobiographer_memories_era_idx
    ON agos_autobiographer_memories (user_id, era_date_estimate)
    WHERE era_date_estimate IS NOT NULL;

COMMENT ON COLUMN agos_autobiographer_memories.book_id IS
  'Nullable FK to agos_autobiographer_books. Memories are workshop-global by default and may be attached/detached without losing the underlying capture. ON DELETE SET NULL preserves memories when their book is removed.';

COMMENT ON COLUMN agos_autobiographer_memories.audio_url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_autobiographer_memories.photo_urls IS
  'Array of external URLs. Asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_autobiographer_memories.transcript IS
  'Optional transcript text, populated when source = ''audio_transcript''. Audio transcription pipeline is deferred; for v1 the user pastes their own STT output.';

COMMENT ON COLUMN agos_autobiographer_memories.is_sensitive IS
  'Boolean flag for Phase 6 (Privacy review) processing. Authors may pre-mark captures that warrant a privacy + consent pass before any chapter draws from them.';

COMMENT ON COLUMN agos_autobiographer_memories.when_in_life IS
  'Free-form era label ("around 1985", "high school years", "right after Mom passed"). Pair with era_date_estimate for structured sorting.';

COMMENT ON COLUMN agos_autobiographer_memories.era_date_estimate IS
  'Optional structured DATE estimate used for timeline ordering when when_in_life is too vague to parse. NULL is the default and the common case.';
"""


_DOWNGRADE_SQL = r"""
-- Drop in dependency order: memories has an FK into books.
DROP INDEX IF EXISTS agos_autobiographer_memories_era_idx;
DROP INDEX IF EXISTS agos_autobiographer_memories_emotion_tags_gin_idx;
DROP INDEX IF EXISTS agos_autobiographer_memories_content_tags_gin_idx;
DROP INDEX IF EXISTS agos_autobiographer_memories_book_idx;
DROP INDEX IF EXISTS agos_autobiographer_memories_user_idx;
DROP TABLE IF EXISTS agos_autobiographer_memories;

DROP INDEX IF EXISTS agos_autobiographer_books_tags_gin_idx;
DROP INDEX IF EXISTS agos_autobiographer_books_user_status_idx;
DROP TABLE IF EXISTS agos_autobiographer_books;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
