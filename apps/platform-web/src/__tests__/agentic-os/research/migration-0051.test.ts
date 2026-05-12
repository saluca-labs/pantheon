/**
 * Research OS Phase 4 — migration 0051 smoke test.
 *
 * Reads the SQL text directly and asserts structural properties of the
 * literature-library migration:
 *   - Revision identifier + down_revision wired correctly (catches a
 *     copy-paste of the stale plan-doc 0044 anchor / 0043 down_revision).
 *   - 4 new tables (papers, authors, paper_authors, experiment_references)
 *     created with the documented column set + CHECKs.
 *   - Idempotent DDL (CREATE TABLE / INDEX / UNIQUE INDEX IF NOT EXISTS).
 *   - Partial UNIQUE on (user_id, doi) WHERE doi IS NOT NULL.
 *   - Partial UNIQUE on (user_id, arxiv_id) WHERE arxiv_id IS NOT NULL.
 *   - Partial UNIQUE on (user_id, orcid) WHERE orcid IS NOT NULL.
 *   - GIN index on papers.tags.
 *   - paper_authors UNIQUE constraints (paper_id, position) +
 *     (paper_id, author_id), 1-indexed position CHECK.
 *   - experiment_references UNIQUE (experiment_id, paper_id, relevance).
 *   - NO FK on experiment_id in experiment_references (v0.1.30).
 *   - Downgrade drops tables in reverse order.
 *   - Zero `:<word>` bind-marker patterns in raw SQL bodies (footgun).
 *   - op.execute uses string constants (not text(...)).
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0051_research_phase4.py',
);
const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0051_research_phase4', () => {
  it('declares the correct revision identifier', () => {
    expect(sql).toMatch(/revision: str = "0051_research_phase4"/);
  });

  it('declares the correct down_revision (post-Phase-3 chain)', () => {
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0050_research_phase3"/,
    );
  });

  it('does NOT chain off the stale plan-doc revision 0043', () => {
    // Plan doc said 0044 with down_revision 0043_research_phase3; that's
    // stale (Phase 3 shipped as 0050, not 0043).
    expect(sql).not.toMatch(/down_revision[^"]*"0043_research_phase3"/);
    expect(sql).not.toMatch(/revision: str = "0044_research_phase4"/);
  });

  // ─── agos_research_papers ─────────────────────────────────────────────

  it('creates agos_research_papers idempotently', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS agos_research_papers/);
  });

  it('papers table carries the full column set', () => {
    const required = [
      'id            UUID PRIMARY KEY',
      'user_id       UUID NOT NULL',
      'title         TEXT NOT NULL',
      "kind          TEXT NOT NULL DEFAULT 'paper'",
      'doi           TEXT,',
      'arxiv_id      TEXT,',
      'url           TEXT,',
      'authors_text  TEXT,',
      'venue         TEXT,',
      'year          INT,',
      'abstract_md   TEXT,',
      "tags          TEXT[] NOT NULL DEFAULT '{}'",
      'metadata      JSONB',
      'archived_at   TIMESTAMPTZ,',
      'created_at    TIMESTAMPTZ NOT NULL DEFAULT now()',
      'updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()',
    ];
    for (const col of required) expect(sql).toContain(col);
  });

  it('papers kind CHECK covers all 9 values', () => {
    expect(sql).toMatch(
      /CHECK \(kind IN \('paper','preprint','thesis','book','chapter','dataset_paper','report','blog','other'\)\)/,
    );
  });

  it('papers has (user_id, updated_at DESC) index', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_papers_user_updated_idx[\s\S]*?\(user_id, updated_at DESC\)/,
    );
  });

  it('papers has GIN index on tags', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_papers_tags_gin_idx[\s\S]*?USING gin \(tags\)/,
    );
  });

  it('papers has partial UNIQUE on (user_id, doi) WHERE doi IS NOT NULL', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS agos_research_papers_user_doi_uniq[\s\S]*?\(user_id, doi\)[\s\S]*?WHERE doi IS NOT NULL/,
    );
  });

  it('papers has partial UNIQUE on (user_id, arxiv_id) WHERE arxiv_id IS NOT NULL', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS agos_research_papers_user_arxiv_uniq[\s\S]*?\(user_id, arxiv_id\)[\s\S]*?WHERE arxiv_id IS NOT NULL/,
    );
  });

  it('papers comments document the URL-only MCP storage contract', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_research_papers\.url/);
    expect(sql).toMatch(/MCP storage-transfer contract/);
  });

  it('papers comments document archived_at semantics', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_research_papers\.archived_at/);
    expect(sql).toMatch(/Soft-archive marker/);
  });

  // ─── agos_research_authors ────────────────────────────────────────────

  it('creates agos_research_authors idempotently', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS agos_research_authors/);
  });

  it('authors table carries the full column set', () => {
    const required = [
      'id            UUID PRIMARY KEY',
      'user_id       UUID NOT NULL',
      'display_name  TEXT NOT NULL',
      'given_name    TEXT,',
      'family_name   TEXT,',
      'orcid         TEXT,',
      'affiliation   TEXT,',
      'metadata      JSONB',
    ];
    for (const col of required) expect(sql).toContain(col);
  });

  it('authors has (user_id, family_name) index for the alphabet rail', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_authors_user_family_idx[\s\S]*?\(user_id, family_name\)/,
    );
  });

  it('authors has partial UNIQUE on (user_id, orcid) WHERE orcid IS NOT NULL', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS agos_research_authors_user_orcid_uniq[\s\S]*?\(user_id, orcid\)[\s\S]*?WHERE orcid IS NOT NULL/,
    );
  });

  // ─── agos_research_paper_authors (join with position) ─────────────────

  it('creates agos_research_paper_authors idempotently', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS agos_research_paper_authors/);
  });

  it('paper_authors has FK CASCADE on paper_id AND author_id', () => {
    const block = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_paper_authors \(([\s\S]*?)\);/,
    );
    expect(block?.[1]).toMatch(
      /paper_id\s+UUID NOT NULL REFERENCES agos_research_papers\(id\) ON DELETE CASCADE/,
    );
    expect(block?.[1]).toMatch(
      /author_id\s+UUID NOT NULL REFERENCES agos_research_authors\(id\) ON DELETE CASCADE/,
    );
  });

  it('paper_authors position is 1-indexed (CHECK >= 1)', () => {
    expect(sql).toMatch(/CHECK \(position >= 1\)/);
  });

  it('paper_authors has UNIQUE (paper_id, position)', () => {
    expect(sql).toMatch(
      /UNIQUE \(paper_id, position\)/,
    );
  });

  it('paper_authors has UNIQUE (paper_id, author_id) — no duplicate links', () => {
    expect(sql).toMatch(
      /UNIQUE \(paper_id, author_id\)/,
    );
  });

  it('paper_authors has author_id index for reverse-lookup', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_paper_authors_author_idx[\s\S]*?\(author_id\)/,
    );
  });

  // ─── agos_research_experiment_references ──────────────────────────────

  it('creates agos_research_experiment_references idempotently', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS agos_research_experiment_references/);
  });

  it('experiment_references has FK CASCADE on paper_id', () => {
    const block = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_experiment_references \(([\s\S]*?)\);/,
    );
    expect(block?.[1]).toMatch(
      /paper_id\s+UUID NOT NULL REFERENCES agos_research_papers\(id\) ON DELETE CASCADE/,
    );
  });

  it('experiment_references does NOT declare a FK on experiment_id (v0.1.30 contract)', () => {
    const block = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_experiment_references \(([\s\S]*?)\);/,
    );
    expect(block?.[1]).not.toMatch(/experiment_id[^,]*REFERENCES/);
  });

  it('experiment_references relevance CHECK covers all 5 values', () => {
    expect(sql).toMatch(
      /CHECK \(relevance IN \('cites','methods','prior_art','contradicts','builds_on'\)\)/,
    );
  });

  it('experiment_references has UNIQUE (experiment_id, paper_id, relevance)', () => {
    expect(sql).toMatch(
      /UNIQUE \(experiment_id, paper_id, relevance\)/,
    );
  });

  it('experiment_references has indexes on (experiment_id) AND (paper_id)', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiment_references_experiment_idx[\s\S]*?\(experiment_id\)/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiment_references_paper_idx[\s\S]*?\(paper_id\)/,
    );
  });

  it('experiment_references comments document the v0.1.30 contract', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_research_experiment_references\.experiment_id/,
    );
    expect(sql).toMatch(/No FK per platform v0\.1\.30 contract/);
  });

  // ─── Downgrade ───────────────────────────────────────────────────────

  it('downgrade drops the 4 new tables in reverse order', () => {
    const downIdx = sql.indexOf('_DOWNGRADE_SQL');
    expect(downIdx).toBeGreaterThan(0);
    const body = sql.slice(downIdx);
    const erPos = body.indexOf('DROP TABLE IF EXISTS agos_research_experiment_references');
    const paPos = body.indexOf('DROP TABLE IF EXISTS agos_research_paper_authors');
    const auPos = body.indexOf('DROP TABLE IF EXISTS agos_research_authors');
    const paperPos = body.indexOf('DROP TABLE IF EXISTS agos_research_papers');
    expect(erPos).toBeGreaterThan(0);
    expect(paPos).toBeGreaterThan(erPos);
    expect(auPos).toBeGreaterThan(paPos);
    expect(paperPos).toBeGreaterThan(auPos);
  });

  it('downgrade drops every created index', () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_experiment_references_paper_idx/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_experiment_references_experiment_idx/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_paper_authors_author_idx/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_authors_user_orcid_uniq/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_authors_user_family_idx/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_papers_user_arxiv_uniq/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_papers_user_doi_uniq/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_papers_tags_gin_idx/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_papers_user_updated_idx/);
  });

  // ─── Footgun guards ──────────────────────────────────────────────────

  it('uses op.execute with the raw _UPGRADE_SQL constant (no text() bind risk)', () => {
    expect(sql).toMatch(/op\.execute\(_UPGRADE_SQL\)/);
    expect(sql).toMatch(/op\.execute\(_DOWNGRADE_SQL\)/);
  });

  it('does NOT wrap raw SQL in sqlalchemy.text()', () => {
    const upgradeFn = sql.match(/def upgrade\(\) -> None:([\s\S]*?)def downgrade/);
    const downgradeFn = sql.match(/def downgrade\(\) -> None:([\s\S]*)/);
    expect(upgradeFn?.[1] ?? '').not.toMatch(/op\.execute\(text\(/);
    expect(downgradeFn?.[1] ?? '').not.toMatch(/op\.execute\(text\(/);
  });

  it('zero :<word> bind-marker patterns inside the SQL bodies', () => {
    const bodies = sql.match(/r"""[\s\S]*?"""/g) ?? [];
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      const noCasts = body.replace(/::[A-Za-z_][A-Za-z0-9_]*/g, '');
      const matches = noCasts.match(/(?<![A-Za-z0-9:])[A-Za-z_]?:[A-Za-z_][A-Za-z0-9_]*/g);
      const real = (matches ?? []).filter(
        (m) => !/^https?:/i.test(m) && !/^[a-z]+:\/\//i.test(m),
      );
      expect(real).toEqual([]);
    }
  });

  it('module-level revision metadata wired (alembic discovery)', () => {
    expect(sql).toMatch(/from alembic import op/);
    expect(sql).toMatch(/branch_labels: Union\[str, Sequence\[str\], None\] = None/);
    expect(sql).toMatch(/depends_on: Union\[str, Sequence\[str\], None\] = None/);
  });

  it('docstring documents the reading-notes decision', () => {
    expect(sql).toMatch(/Reading notes live on Phase 2 notebook entries/);
    expect(sql).toMatch(/no separate/i);
  });

  it('docstring documents the citation-graph deferral', () => {
    expect(sql).toMatch(/Citation graph deferred to Phase 8/);
  });

  it('docstring documents URL-only contract', () => {
    expect(sql).toMatch(/URL-only/);
  });
});
