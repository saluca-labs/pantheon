/**
 * Research OS Phase 3 — migration 0050 smoke test.
 *
 * Reads the SQL text directly and asserts structural properties:
 *   - Revision identifier + down_revision wired correctly (catches a
 *     copy-paste of the stale plan-doc 0043 anchor).
 *   - ALTER on agos_research_hypotheses adds the 3 new columns
 *     additively (NO FK on experiment_id per platform v0.1.30).
 *   - All 4 new tables (predictions, falsifiers, evidence, experiment-
 *     hypotheses) created with the documented column set + CHECKs.
 *   - Idempotent DDL (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF
 *     NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 *   - UNIQUE constraint on the join table (experiment_id, hypothesis_id, role).
 *   - Partial source-kind reverse-lookup index on evidence.
 *   - Downgrade drops indexes + tables in reverse order + drops the
 *     ALTER columns.
 *   - Zero `:<word>` bind-marker patterns in raw SQL bodies.
 *   - No FK on either `experiment_id` column.
 *   - op.execute uses string constants (not text(...)).
 *
 * Mirrors `migration-0049.test.ts`.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0050_research_phase3.py',
);
const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0050_research_phase3', () => {
  it('declares the correct revision identifier', () => {
    expect(sql).toMatch(/revision: str = "0050_research_phase3"/);
  });

  it('declares the correct down_revision (post-Phase-2 chain)', () => {
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0049_research_phase2"/,
    );
  });

  it('does NOT chain off the stale plan-doc revision 0042', () => {
    // Plan doc said 0043 with down_revision 0042_research_phase2; that's
    // stale (Phase 2 shipped as 0049).
    expect(sql).not.toMatch(/down_revision[^"]*"0042_research_phase2"/);
  });

  // ─── ALTER agos_research_hypotheses ──────────────────────────────────────

  it('ALTERs agos_research_hypotheses additively', () => {
    expect(sql).toMatch(/ALTER TABLE agos_research_hypotheses/);
  });

  it('adds experiment_id UUID nullable on the hypothesis table', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS experiment_id\s+UUID/);
    // No NOT NULL on this column.
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS experiment_id\s+UUID\s+NOT NULL/);
  });

  it('does NOT declare a FK on the hypothesis ALTER experiment_id column', () => {
    // ALTER ADD COLUMN should not carry a REFERENCES clause for the new column.
    expect(sql).not.toMatch(
      /ADD COLUMN IF NOT EXISTS experiment_id[^,;]*REFERENCES/,
    );
  });

  it('adds description_md TEXT NOT NULL DEFAULT empty string', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS description_md TEXT NOT NULL DEFAULT ''/,
    );
  });

  it('adds archived_at TIMESTAMPTZ nullable', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS archived_at\s+TIMESTAMPTZ/);
    expect(sql).not.toMatch(
      /ADD COLUMN IF NOT EXISTS archived_at\s+TIMESTAMPTZ\s+NOT NULL/,
    );
  });

  it('comments experiment_id on hypotheses as a legacy soft pointer', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_research_hypotheses\.experiment_id/,
    );
    expect(sql).toMatch(/Legacy soft pointer/);
    expect(sql).toMatch(/No FK per platform v0\.1\.30 contract/);
  });

  it('comments description_md and archived_at on hypotheses', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_research_hypotheses\.description_md/);
    expect(sql).toMatch(/COMMENT ON COLUMN agos_research_hypotheses\.archived_at/);
  });

  // ─── agos_research_hypothesis_predictions ─────────────────────────────

  it('creates agos_research_hypothesis_predictions idempotently', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_research_hypothesis_predictions/,
    );
  });

  it('predictions table carries the full column set', () => {
    const required = [
      'id            UUID PRIMARY KEY',
      'hypothesis_id UUID NOT NULL',
      'user_id       UUID NOT NULL',
      'text          TEXT NOT NULL',
      "kind          TEXT NOT NULL DEFAULT 'positive'",
      "confidence    TEXT NOT NULL DEFAULT 'medium'",
      'metadata      JSONB',
      'created_at    TIMESTAMPTZ NOT NULL DEFAULT now()',
      'updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()',
    ];
    for (const col of required) expect(sql).toContain(col);
  });

  it('predictions table has FK CASCADE on hypothesis_id', () => {
    expect(sql).toMatch(
      /hypothesis_id UUID NOT NULL REFERENCES agos_research_hypotheses\(id\) ON DELETE CASCADE/,
    );
  });

  it('predictions kind CHECK covers all 4 values', () => {
    expect(sql).toMatch(/CHECK \(kind IN \('positive','negative','magnitude','direction'\)\)/);
  });

  it('predictions confidence CHECK covers low/medium/high', () => {
    expect(sql).toMatch(/CHECK \(confidence IN \('low','medium','high'\)\)/);
  });

  it('predictions table has an index on hypothesis_id', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_hypothesis_predictions_hypothesis_idx[\s\S]*?\(hypothesis_id\)/,
    );
  });

  // ─── agos_research_hypothesis_falsifiers ──────────────────────────────

  it('creates agos_research_hypothesis_falsifiers idempotently', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_research_hypothesis_falsifiers/,
    );
  });

  it('falsifiers table has criterion_md TEXT nullable', () => {
    expect(sql).toMatch(/criterion_md\s+TEXT,/);
  });

  it('falsifiers FK CASCADE on hypothesis_id', () => {
    const block = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_hypothesis_falsifiers \(([\s\S]*?)\);/,
    );
    expect(block?.[1]).toMatch(
      /REFERENCES agos_research_hypotheses\(id\) ON DELETE CASCADE/,
    );
  });

  it('falsifiers table has an index on hypothesis_id', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_hypothesis_falsifiers_hypothesis_idx[\s\S]*?\(hypothesis_id\)/,
    );
  });

  // ─── agos_research_hypothesis_evidence ────────────────────────────────

  it('creates agos_research_hypothesis_evidence idempotently', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_research_hypothesis_evidence/,
    );
  });

  it('evidence polarity CHECK covers supports/refutes/mixed', () => {
    expect(sql).toMatch(/CHECK \(polarity IN \('supports','refutes','mixed'\)\)/);
  });

  it('evidence source_kind CHECK covers all 5 values', () => {
    expect(sql).toMatch(
      /CHECK \(source_kind IN \('notebook_entry','paper','dataset','external_url','free_text'\)\)/,
    );
  });

  it('evidence table allows source_id + source_url nullable (polymorphic)', () => {
    const block = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_hypothesis_evidence \(([\s\S]*?)\);/,
    );
    expect(block?.[1]).toMatch(/source_id\s+UUID,/);
    expect(block?.[1]).toMatch(/source_url\s+TEXT,/);
  });

  it('evidence has primary hypothesis_id index', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_hypothesis_evidence_hypothesis_idx[\s\S]*?\(hypothesis_id\)/,
    );
  });

  it('evidence has partial reverse-lookup index on (source_kind, source_id) WHERE source_id IS NOT NULL', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_hypothesis_evidence_source_idx[\s\S]*?\(source_kind, source_id\)[\s\S]*?WHERE source_id IS NOT NULL/,
    );
  });

  it('evidence FK CASCADE on hypothesis_id', () => {
    const block = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_hypothesis_evidence \(([\s\S]*?)\);/,
    );
    expect(block?.[1]).toMatch(
      /REFERENCES agos_research_hypotheses\(id\) ON DELETE CASCADE/,
    );
  });

  it('evidence has NO source_id FK (polymorphic discriminator)', () => {
    const block = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_hypothesis_evidence \(([\s\S]*?)\);/,
    );
    expect(block?.[1]).not.toMatch(/source_id[^,]*REFERENCES/);
  });

  // ─── agos_research_experiment_hypotheses ─────────────────────────────

  it('creates agos_research_experiment_hypotheses idempotently', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_research_experiment_hypotheses/,
    );
  });

  it('join table has role CHECK in (tests, motivates, related)', () => {
    expect(sql).toMatch(/CHECK \(role IN \('tests','motivates','related'\)\)/);
  });

  it('join table has UNIQUE (experiment_id, hypothesis_id, role)', () => {
    expect(sql).toMatch(
      /UNIQUE \(experiment_id, hypothesis_id, role\)/,
    );
  });

  it('join table FK CASCADE on hypothesis_id', () => {
    const block = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_experiment_hypotheses \(([\s\S]*?)\);/,
    );
    expect(block?.[1]).toMatch(
      /hypothesis_id UUID NOT NULL REFERENCES agos_research_hypotheses\(id\) ON DELETE CASCADE/,
    );
  });

  it('join table does NOT declare a FK on experiment_id (v0.1.30 contract)', () => {
    const block = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_research_experiment_hypotheses \(([\s\S]*?)\);/,
    );
    expect(block?.[1]).not.toMatch(/experiment_id[^,]*REFERENCES/);
  });

  it('join table has indexes on (experiment_id) and (hypothesis_id)', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiment_hypotheses_experiment_idx[\s\S]*?\(experiment_id\)/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiment_hypotheses_hypothesis_idx[\s\S]*?\(hypothesis_id\)/,
    );
  });

  it('comments experiment_id on the join table with the ownership-enforcement note', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_research_experiment_hypotheses\.experiment_id/,
    );
    expect(sql).toMatch(/No FK per platform v0\.1\.30 contract/);
  });

  // ─── Downgrade ───────────────────────────────────────────────────────

  it('downgrade drops the 4 new tables in reverse order', () => {
    const downIdx = sql.indexOf('_DOWNGRADE_SQL');
    expect(downIdx).toBeGreaterThan(0);
    const body = sql.slice(downIdx);
    const joinPos = body.indexOf('DROP TABLE IF EXISTS agos_research_experiment_hypotheses');
    const evPos = body.indexOf('DROP TABLE IF EXISTS agos_research_hypothesis_evidence');
    const falsPos = body.indexOf('DROP TABLE IF EXISTS agos_research_hypothesis_falsifiers');
    const predPos = body.indexOf('DROP TABLE IF EXISTS agos_research_hypothesis_predictions');
    expect(joinPos).toBeGreaterThan(0);
    expect(evPos).toBeGreaterThan(joinPos);
    expect(falsPos).toBeGreaterThan(evPos);
    expect(predPos).toBeGreaterThan(falsPos);
  });

  it('downgrade drops every created index', () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_experiment_hypotheses_hypothesis_idx/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_experiment_hypotheses_experiment_idx/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_hypothesis_evidence_source_idx/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_hypothesis_evidence_hypothesis_idx/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_hypothesis_falsifiers_hypothesis_idx/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_hypothesis_predictions_hypothesis_idx/);
  });

  it('downgrade drops the ALTER columns on agos_research_hypotheses', () => {
    expect(sql).toMatch(/ALTER TABLE agos_research_hypotheses[\s\S]*?DROP COLUMN IF EXISTS archived_at/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS description_md/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS experiment_id/);
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

  it('docstring documents the workshop-global hypothesis decision', () => {
    expect(sql).toMatch(/legacy/i);
    expect(sql).toMatch(/N:M join/);
  });

  it('docstring documents the evidence polymorphism decision', () => {
    expect(sql).toMatch(/polymorphic/i);
    expect(sql).toMatch(/source_kind/);
  });
});
