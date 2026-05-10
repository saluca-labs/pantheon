"""Filmmaker OS Phase 2 — story documents (bible/treatment/logline/outline/pitch_deck).

Revision ID: 0022_filmmaker_story_documents
Revises: 0021_filmmaker_project_meta
Create Date: 2026-05-10

Phase 2 of the Filmmaker OS buildout. Introduces a single per-project
document table with a `kind` discriminator that backs every story-side
surface (Bible, Treatment, Logline, Outline, Pitch Deck). All later
phases (script breakdown, AI coach, character development) read from
this table.

Tables
------

`agos_filmmaker_story_documents`
    Per-project rich-text documents with a TipTap JSON body. The
    server denormalises plain text and word count from `content_json`
    for search + display without parsing the doc on every read.

`agos_filmmaker_story_document_versions`
    Append-only snapshot history. NOT written on every save (autosave
    would be too noisy); writes happen on explicit "save snapshot" and
    on auto-snapshot gated by an inactivity window in the API layer.

Kind taxonomy
-------------

    bible       — series bible (themes, world rules, tone)
    treatment   — narrative treatment (full prose)
    logline     — one-sentence pitch
    outline     — structural outline (acts/beats)
    pitch_deck  — pitch deck content (sections)

References
----------
  - TipTap JSON schema (ProseMirror):
    https://tiptap.dev/api/schema
  - Series bible / treatment conventions:
    https://www.studiobinder.com/blog/film-treatment/
    https://www.masterclass.com/articles/how-to-write-a-tv-show-bible

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0022_filmmaker_story_documents"
down_revision: Union[str, None] = "0021_filmmaker_project_meta"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Story documents ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS agos_filmmaker_story_documents (
    id              UUID        PRIMARY KEY,
    project_id      UUID        NOT NULL
                                REFERENCES agos_filmmaker_projects(id)
                                ON DELETE CASCADE,
    kind            TEXT        NOT NULL,
    title           TEXT        NOT NULL,
    content_json    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    content_text    TEXT        NOT NULL DEFAULT '',
    version         INTEGER     NOT NULL DEFAULT 1,
    word_count      INTEGER     NOT NULL DEFAULT 0,
    metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_filmmaker_story_documents_kind_chk
        CHECK (kind IN ('bible','treatment','logline','outline','pitch_deck'))
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_story_documents_project_kind_idx
    ON agos_filmmaker_story_documents (project_id, kind);

CREATE INDEX IF NOT EXISTS agos_filmmaker_story_documents_project_updated_idx
    ON agos_filmmaker_story_documents (project_id, updated_at DESC);

-- Full-text search index. v0.1.18 only seeds the index; the query
-- surfaces it later. Using GIN on to_tsvector('english', content_text)
-- so future search uses websearch_to_tsquery without a re-index.
CREATE INDEX IF NOT EXISTS agos_filmmaker_story_documents_text_fts_idx
    ON agos_filmmaker_story_documents
    USING gin (to_tsvector('english', content_text));

COMMENT ON COLUMN agos_filmmaker_story_documents.content_json IS
  'TipTap JSON doc (ProseMirror schema). Authoritative source of truth.';

COMMENT ON COLUMN agos_filmmaker_story_documents.content_text IS
  'Denormalised plain text extracted from content_json. Search + word_count source.';

COMMENT ON COLUMN agos_filmmaker_story_documents.kind IS
  'Discriminator: bible | treatment | logline | outline | pitch_deck.';

-- Story document version history -----------------------------------------

CREATE TABLE IF NOT EXISTS agos_filmmaker_story_document_versions (
    id              UUID        PRIMARY KEY,
    document_id     UUID        NOT NULL
                                REFERENCES agos_filmmaker_story_documents(id)
                                ON DELETE CASCADE,
    version         INTEGER     NOT NULL,
    content_json    JSONB       NOT NULL,
    content_text    TEXT        NOT NULL DEFAULT '',
    word_count      INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agos_filmmaker_story_document_versions_doc_version_idx
    ON agos_filmmaker_story_document_versions (document_id, version DESC);

COMMENT ON TABLE agos_filmmaker_story_document_versions IS
  'Append-only snapshots. Written on explicit "save snapshot" or auto-snapshot (gated by inactivity), never on every autosave.';
"""

_DOWNGRADE_SQL = """
DROP TABLE IF EXISTS agos_filmmaker_story_document_versions;
DROP TABLE IF EXISTS agos_filmmaker_story_documents;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
