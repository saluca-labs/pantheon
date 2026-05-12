"""Research OS Phase 4 — Literature Library.

Revision ID: 0051_research_phase4
Revises: 0050_research_phase3
Create Date: 2026-05-12

Phase 4 of Research OS adds the workshop-global literature library:
papers, structured authors, the join between them, and the per-
experiment N:M reference join. Four new tables, all under
``agos_research_*``:

  1. ``agos_research_papers`` — workshop-global. ``user_id NOT NULL``,
       ``title NOT NULL``, ``kind`` CHECK in
       ``(paper, preprint, thesis, book, chapter, dataset_paper,
       report, blog, other)``, optional ``doi`` / ``arxiv_id`` / ``url``
       (URL-only per the MCP storage-transfer contract). Free-form
       ``authors_text`` is a fallback; the structured join is canonical
       when present. ``tags TEXT[] NOT NULL DEFAULT '{}'``,
       ``abstract_md TEXT``, ``year INT``, ``venue TEXT``,
       ``metadata JSONB``. Soft-archive via ``archived_at`` (mirrors
       Phase 2 notebook). Partial UNIQUE
       ``(user_id, doi) WHERE doi IS NOT NULL`` and
       ``(user_id, arxiv_id) WHERE arxiv_id IS NOT NULL`` dedupe the
       common "I clipped this paper twice" case without blocking the
       manual no-identifier flow. GIN index on ``tags`` powers tag
       filter chips.

  2. ``agos_research_authors`` — workshop-global. ``user_id NOT NULL``,
       ``display_name NOT NULL``, optional ``given_name`` /
       ``family_name`` / ``orcid`` / ``affiliation`` / ``metadata``.
       Partial UNIQUE ``(user_id, orcid) WHERE orcid IS NOT NULL``.
       Index ``(user_id, family_name)`` for the family-name browse.

  3. ``agos_research_paper_authors`` — join with position. ``paper_id``
       FK CASCADE → papers, ``author_id`` FK CASCADE → authors,
       ``position INT NOT NULL`` (1-indexed for natural display).
       UNIQUE ``(paper_id, position)`` — one author per slot. UNIQUE
       ``(paper_id, author_id)`` — no duplicate links. Index
       ``(author_id)``.

  4. ``agos_research_experiment_references`` — experiment↔paper N:M.
       ``experiment_id UUID NOT NULL`` (NO FK — platform v0.1.30
       contract), ``paper_id`` FK CASCADE → papers, ``relevance``
       CHECK in ``(cites, methods, prior_art, contradicts,
       builds_on)``, ``notes TEXT``. UNIQUE
       ``(experiment_id, paper_id, relevance)`` — different relevance
       values for the same pair are allowed. Indexes
       ``(experiment_id)``, ``(paper_id)``.

Locked design decisions
-----------------------
- **Reading notes live on Phase 2 notebook entries.** A notebook entry
  with ``entry_kind='note'`` paired with a Phase 3 evidence row of
  ``source_kind='paper'`` IS the reading-note. No separate
  ``reading_notes`` table.
- **Citation graph deferred to Phase 8.** The references join is
  experiment↔paper only.
- **No automatic metadata fetch from DOI / arXiv.** The user pastes
  structured fields manually; no CrossRef / arXiv-API dependency.
- **URL-only for the PDF surface.** The ``url`` column points at the
  hosted PDF; binary content is governed by the MCP storage-transfer
  contract.
- **No FK on ``experiment_id``** in the references join — platform
  v0.1.30 dropped cross-OS UUID FKs; ownership lives at the BFF.
- **Soft archive on papers.** DELETE on a paper sets ``archived_at``
  rather than hard-deleting (mirrors Phase 2 notebook). Authors are
  hard-delete with a 409 guard if any paper still links.

Idempotency
-----------
All DDL is idempotent: ``CREATE TABLE IF NOT EXISTS`` /
``CREATE INDEX IF NOT EXISTS`` / ``CREATE UNIQUE INDEX IF NOT EXISTS``.
Safe to re-run on a partially-applied database.

Bind-marker safety
------------------
Per prior-phase footgun: SQLAlchemy's ``text()`` parses ``:word``
patterns as bind markers. This module uses ``op.execute`` with a raw
string constant (NOT ``op.execute(text(...))``); the SQL bodies carry
zero ``:<word>`` patterns (the test guard asserts this). "N:M" in
prose was rewritten as "many-to-many" in the SQL strings.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0051_research_phase4"
down_revision: Union[str, None] = "0050_research_phase3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. agos_research_papers ---------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_research_papers (
    id            UUID PRIMARY KEY,
    user_id       UUID NOT NULL,
    title         TEXT NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'paper',
    doi           TEXT,
    arxiv_id      TEXT,
    url           TEXT,
    authors_text  TEXT,
    venue         TEXT,
    year          INT,
    abstract_md   TEXT,
    tags          TEXT[] NOT NULL DEFAULT '{}',
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    archived_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_research_papers_kind_chk
        CHECK (kind IN ('paper','preprint','thesis','book','chapter','dataset_paper','report','blog','other'))
);

COMMENT ON TABLE agos_research_papers IS
  'Workshop-global literature library. URL-only for the PDF surface per the MCP storage-transfer contract. Soft-archive via archived_at; structured authors via the paper_authors join when present, else authors_text fallback.';

COMMENT ON COLUMN agos_research_papers.url IS
  'External URL to the hosted PDF or landing page. Binary content is governed by the MCP storage-transfer contract (docs/architecture/mcp-storage-transfer.md); this column never stores binary.';

COMMENT ON COLUMN agos_research_papers.authors_text IS
  'Free-form authors fallback for paste-from-citation. When agos_research_paper_authors rows exist for this paper, the structured join is authoritative.';

COMMENT ON COLUMN agos_research_papers.archived_at IS
  'Soft-archive marker. NULL = active; non-NULL = the timestamp the paper was archived. DELETE on the route layer sets this rather than hard-deleting.';

CREATE INDEX IF NOT EXISTS agos_research_papers_user_updated_idx
    ON agos_research_papers (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS agos_research_papers_tags_gin_idx
    ON agos_research_papers USING gin (tags);

-- Partial UNIQUE on DOI per user — dedupe DOI clips without blocking
-- the manual no-identifier flow.
CREATE UNIQUE INDEX IF NOT EXISTS agos_research_papers_user_doi_uniq
    ON agos_research_papers (user_id, doi)
    WHERE doi IS NOT NULL;

-- Partial UNIQUE on arXiv ID per user — same rationale.
CREATE UNIQUE INDEX IF NOT EXISTS agos_research_papers_user_arxiv_uniq
    ON agos_research_papers (user_id, arxiv_id)
    WHERE arxiv_id IS NOT NULL;

-- 2. agos_research_authors --------------------------------------------------
CREATE TABLE IF NOT EXISTS agos_research_authors (
    id            UUID PRIMARY KEY,
    user_id       UUID NOT NULL,
    display_name  TEXT NOT NULL,
    given_name    TEXT,
    family_name   TEXT,
    orcid         TEXT,
    affiliation   TEXT,
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE agos_research_authors IS
  'Workshop-global authors. ORCID is the canonical identifier when known; family_name backs the alphabetical browse.';

COMMENT ON COLUMN agos_research_authors.orcid IS
  'ORCID identifier (0000-0000-0000-0000 form). Partial UNIQUE per user — same user cannot have two author rows with the same ORCID.';

CREATE INDEX IF NOT EXISTS agos_research_authors_user_family_idx
    ON agos_research_authors (user_id, family_name);

CREATE UNIQUE INDEX IF NOT EXISTS agos_research_authors_user_orcid_uniq
    ON agos_research_authors (user_id, orcid)
    WHERE orcid IS NOT NULL;

-- 3. agos_research_paper_authors (join with position) ----------------------
CREATE TABLE IF NOT EXISTS agos_research_paper_authors (
    id            UUID PRIMARY KEY,
    paper_id      UUID NOT NULL REFERENCES agos_research_papers(id) ON DELETE CASCADE,
    author_id     UUID NOT NULL REFERENCES agos_research_authors(id) ON DELETE CASCADE,
    position      INT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_research_paper_authors_position_chk
        CHECK (position >= 1),
    CONSTRAINT agos_research_paper_authors_paper_position_uniq
        UNIQUE (paper_id, position),
    CONSTRAINT agos_research_paper_authors_paper_author_uniq
        UNIQUE (paper_id, author_id)
);

COMMENT ON TABLE agos_research_paper_authors IS
  'Ordered author list for a paper. 1-indexed position for natural display. Both author and paper carry FK CASCADE — deleting either removes the link.';

CREATE INDEX IF NOT EXISTS agos_research_paper_authors_author_idx
    ON agos_research_paper_authors (author_id);

-- 4. agos_research_experiment_references (experiment-paper many-to-many) ---
CREATE TABLE IF NOT EXISTS agos_research_experiment_references (
    id            UUID PRIMARY KEY,
    experiment_id UUID NOT NULL,
    paper_id      UUID NOT NULL REFERENCES agos_research_papers(id) ON DELETE CASCADE,
    relevance     TEXT NOT NULL DEFAULT 'cites',
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_research_experiment_references_relevance_chk
        CHECK (relevance IN ('cites','methods','prior_art','contradicts','builds_on')),
    CONSTRAINT agos_research_experiment_references_unique_edge
        UNIQUE (experiment_id, paper_id, relevance)
);

COMMENT ON TABLE agos_research_experiment_references IS
  'Many-to-many between experiments and papers. One experiment can cite many papers; one paper can be cited from many experiments. Different relevance values for the same pair are allowed (e.g. cites + methods).';

COMMENT ON COLUMN agos_research_experiment_references.experiment_id IS
  'Soft pointer to agos_research_experiments(id). No FK per platform v0.1.30 contract; the BFF route layer enforces ownership via JOIN.';

CREATE INDEX IF NOT EXISTS agos_research_experiment_references_experiment_idx
    ON agos_research_experiment_references (experiment_id);

CREATE INDEX IF NOT EXISTS agos_research_experiment_references_paper_idx
    ON agos_research_experiment_references (paper_id);
"""


_DOWNGRADE_SQL = r"""
-- Reverse order vs upgrade.
DROP INDEX IF EXISTS agos_research_experiment_references_paper_idx;
DROP INDEX IF EXISTS agos_research_experiment_references_experiment_idx;
DROP TABLE IF EXISTS agos_research_experiment_references;

DROP INDEX IF EXISTS agos_research_paper_authors_author_idx;
DROP TABLE IF EXISTS agos_research_paper_authors;

DROP INDEX IF EXISTS agos_research_authors_user_orcid_uniq;
DROP INDEX IF EXISTS agos_research_authors_user_family_idx;
DROP TABLE IF EXISTS agos_research_authors;

DROP INDEX IF EXISTS agos_research_papers_user_arxiv_uniq;
DROP INDEX IF EXISTS agos_research_papers_user_doi_uniq;
DROP INDEX IF EXISTS agos_research_papers_tags_gin_idx;
DROP INDEX IF EXISTS agos_research_papers_user_updated_idx;
DROP TABLE IF EXISTS agos_research_papers;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
