"""Autobiographer OS Phase 6 — privacy, consent audit, and redaction.

Revision ID: 0047_autobiographer_phase6
Revises: 0046_autobiographer_phase5
Create Date: 2026-05-12

Phase 6 of Autobiographer OS makes the manuscript safe to hand to an
outside reader. Three additions:

1. ``sensitive_kinds TEXT[]`` on ``agos_autobiographer_memories`` and on
   ``agos_autobiographer_chapter_revisions``. App-side enum validation
   over the canonical set (sexual, abuse, mental_health, legal,
   financial, death, medical, other). GIN index per table.

2. ``agos_autobiographer_pseudonyms`` — per-book person rename map.
   UNIQUE (book_id, person_id) so a person carries at most one
   pseudonym per book.

3. ``agos_autobiographer_review_checks`` — pre-publication checklist
   gating chapter / book lock. UNIQUE (chapter_id, kind) where
   chapter_id IS NOT NULL; UNIQUE (book_id, kind) where chapter_id IS
   NULL (book-level checks).

The plan doc anchor lives in
``apps/platform-web/content/agentic-os/autobiographer.md`` (Phase 6
section). Plan-doc numbering matches the actual migration as of
chore PR #45.

Allowed ``sensitive_kinds`` array values
----------------------------------------
Validated app-side (see ``lib/agentic-os/autobiographer/sensitive-kinds.ts``):

  - ``sexual``
  - ``abuse``
  - ``mental_health``
  - ``legal``
  - ``financial``
  - ``death``
  - ``medical``
  - ``other``

A Postgres CHECK on the array values is intentionally omitted. CHECK
constraints on array contents are clumsy in Postgres and the
app-layer enum is sufficient for the threat model (UI multi-select +
Zod route validation). Future migrations may add a domain type.

GIN index on the array column supports the @>/&&/contains lookups
the privacy hub uses to filter chapters / memories by sensitive kind.

Pseudonyms table
----------------
The pseudonym map is per-book and per-person; the UNIQUE constraint
guarantees a chapter renderer always finds at most one rename row
per person. ``applied BOOLEAN`` is flipped by the export layer when a
substitution actually fires — it surfaces in the privacy hub so the
user knows "this pseudonym is live" vs "set but never substituted".

Review-checks table
-------------------
Two partial UNIQUE indexes carry the "one row per kind per scope"
invariant:

  - ``(chapter_id, kind)`` WHERE chapter_id IS NOT NULL — one row
    per (chapter, kind).
  - ``(book_id, kind)`` WHERE chapter_id IS NULL — one row per
    (book, kind) for book-level checks.

Status and kind are bounded by CHECK constraints (small, closed,
well-known sets). Notes / checked_at / checked_by are free-form.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``,
``CREATE INDEX IF NOT EXISTS``, ``ALTER TABLE … ADD COLUMN IF NOT
EXISTS``).

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0047_autobiographer_phase6"
down_revision: Union[str, None] = "0046_autobiographer_phase5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. ALTER memories + chapter_revisions: add sensitive_kinds TEXT[] ----------

ALTER TABLE agos_autobiographer_memories
    ADD COLUMN IF NOT EXISTS sensitive_kinds TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE agos_autobiographer_chapter_revisions
    ADD COLUMN IF NOT EXISTS sensitive_kinds TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS agos_autobiographer_memories_sensitive_kinds_gin
    ON agos_autobiographer_memories USING GIN (sensitive_kinds);

CREATE INDEX IF NOT EXISTS agos_autobiographer_chapter_revisions_sensitive_kinds_gin
    ON agos_autobiographer_chapter_revisions USING GIN (sensitive_kinds);

COMMENT ON COLUMN agos_autobiographer_memories.sensitive_kinds IS
  'Allowed values validated app-side: sexual abuse mental_health legal financial death medical other. No DB CHECK by design.';

COMMENT ON COLUMN agos_autobiographer_chapter_revisions.sensitive_kinds IS
  'Mirror of memories.sensitive_kinds so derived prose carries its own tags independent of source memory tagging.';

-- 2. agos_autobiographer_pseudonyms ------------------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_pseudonyms (
    id          UUID        PRIMARY KEY,
    book_id     UUID        NOT NULL
                            REFERENCES agos_autobiographer_books(id)
                            ON DELETE CASCADE,
    user_id     UUID        NOT NULL,
    person_id   UUID        NOT NULL
                            REFERENCES agos_autobiographer_people(id)
                            ON DELETE CASCADE,
    pseudonym   TEXT        NOT NULL,
    notes       TEXT        NULL,
    applied     BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One pseudonym per (book, person).
CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_pseudonyms_book_person_uq
    ON agos_autobiographer_pseudonyms (book_id, person_id);

CREATE INDEX IF NOT EXISTS agos_autobiographer_pseudonyms_user_idx
    ON agos_autobiographer_pseudonyms (user_id);

CREATE INDEX IF NOT EXISTS agos_autobiographer_pseudonyms_book_idx
    ON agos_autobiographer_pseudonyms (book_id);

COMMENT ON COLUMN agos_autobiographer_pseudonyms.applied IS
  'Flipped true by the export layer once a substitution actually fires on at least one revision in a PDF render.';

-- 3. agos_autobiographer_review_checks ---------------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_review_checks (
    id          UUID        PRIMARY KEY,
    user_id     UUID        NOT NULL,
    book_id     UUID        NOT NULL
                            REFERENCES agos_autobiographer_books(id)
                            ON DELETE CASCADE,
    chapter_id  UUID        NULL
                            REFERENCES agos_autobiographer_chapters(id)
                            ON DELETE CASCADE,
    kind        TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'pending',
    notes       TEXT        NULL,
    checked_at  TIMESTAMPTZ NULL,
    checked_by  UUID        NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_autobiographer_review_checks_kind_chk
        CHECK (kind IN (
            'consent_collected',
            'sensitive_flagged',
            'attribution_verified',
            'redaction_applied',
            'third_party_disclaimer',
            'legal_reviewed'
        )),
    CONSTRAINT agos_autobiographer_review_checks_status_chk
        CHECK (status IN ('pending','passed','waived','failed'))
);

-- Partial UNIQUE indexes: one row per (chapter, kind) when chapter-scoped,
-- one row per (book, kind) when book-scoped.
CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_review_checks_chapter_kind_uq
    ON agos_autobiographer_review_checks (chapter_id, kind)
    WHERE chapter_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_review_checks_book_kind_uq
    ON agos_autobiographer_review_checks (book_id, kind)
    WHERE chapter_id IS NULL;

CREATE INDEX IF NOT EXISTS agos_autobiographer_review_checks_user_idx
    ON agos_autobiographer_review_checks (user_id);

CREATE INDEX IF NOT EXISTS agos_autobiographer_review_checks_book_idx
    ON agos_autobiographer_review_checks (book_id);

CREATE INDEX IF NOT EXISTS agos_autobiographer_review_checks_chapter_idx
    ON agos_autobiographer_review_checks (chapter_id) WHERE chapter_id IS NOT NULL;

COMMENT ON COLUMN agos_autobiographer_review_checks.chapter_id IS
  'NULL = book-level check (e.g. legal_reviewed for the whole book). Otherwise binds to a single chapter; the lock route requires the chapter-scoped row to be passed/waived.';

COMMENT ON COLUMN agos_autobiographer_review_checks.checked_by IS
  'user_id of the reviewer. Self-review = the author. Free-form attribution lives in notes.';
"""


_DOWNGRADE_SQL = r"""
-- Drop review_checks first (FK chains).
DROP INDEX IF EXISTS agos_autobiographer_review_checks_chapter_idx;
DROP INDEX IF EXISTS agos_autobiographer_review_checks_book_idx;
DROP INDEX IF EXISTS agos_autobiographer_review_checks_user_idx;
DROP INDEX IF EXISTS agos_autobiographer_review_checks_book_kind_uq;
DROP INDEX IF EXISTS agos_autobiographer_review_checks_chapter_kind_uq;
DROP TABLE IF EXISTS agos_autobiographer_review_checks;

DROP INDEX IF EXISTS agos_autobiographer_pseudonyms_book_idx;
DROP INDEX IF EXISTS agos_autobiographer_pseudonyms_user_idx;
DROP INDEX IF EXISTS agos_autobiographer_pseudonyms_book_person_uq;
DROP TABLE IF EXISTS agos_autobiographer_pseudonyms;

DROP INDEX IF EXISTS agos_autobiographer_chapter_revisions_sensitive_kinds_gin;
DROP INDEX IF EXISTS agos_autobiographer_memories_sensitive_kinds_gin;

ALTER TABLE agos_autobiographer_chapter_revisions
    DROP COLUMN IF EXISTS sensitive_kinds;

ALTER TABLE agos_autobiographer_memories
    DROP COLUMN IF EXISTS sensitive_kinds;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
