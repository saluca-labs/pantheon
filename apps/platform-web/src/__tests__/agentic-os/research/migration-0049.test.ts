/**
 * Research OS Phase 2 — migration 0049 smoke test.
 *
 * Reads the SQL text directly and asserts structural properties:
 *   - Revision identifier + down_revision wired correctly.
 *   - Table created with the documented column set + types.
 *   - CHECK constraint on entry_kind covers all 6 values.
 *   - Idempotent DDL (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
 *   - All 4 indexes present, including GIN on tags + the partial
 *     open-todos index with the documented WHERE predicate.
 *   - Soft-delete column `archived_at` present and nullable.
 *   - Downgrade drops indexes + table in reverse order.
 *   - Zero ``:<word>`` bind-marker patterns in the raw SQL body
 *     (the prior-phase footgun).
 *   - No FK on experiment_id (platform v0.1.30 contract).
 *   - op.execute uses string constants (not text(...)).
 *
 * Mirrors the lightweight pattern shipped by 0041_research_phase1 +
 * the autobiographer migration tests.
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0049_research_phase2.py',
);
const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0049_research_phase2', () => {
  it('declares the correct revision identifier', () => {
    expect(sql).toMatch(/revision: str = "0049_research_phase2"/);
  });

  it('declares the correct down_revision (post-Autobiographer chain)', () => {
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0048_autobiographer_phase7"/,
    );
  });

  it('does NOT chain off the stale plan-doc revision 0041', () => {
    // Plan doc said 0042 with down_revision 0041_research_phase1 — that's
    // stale; this guard catches a future regression where someone copies
    // the plan-doc anchor verbatim.
    expect(sql).not.toMatch(/down_revision[^"]*"0041_research_phase1"/);
  });

  it('creates agos_research_notebook_entries idempotently', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS agos_research_notebook_entries/);
  });

  it('table carries the full documented column set', () => {
    const required = [
      'id              UUID PRIMARY KEY',
      'user_id         UUID NOT NULL',
      'experiment_id   UUID NOT NULL',
      "entry_kind      TEXT NOT NULL DEFAULT 'note'",
      'title           TEXT NOT NULL',
      "body_md         TEXT NOT NULL DEFAULT ''",
      'attached_urls   TEXT[] NOT NULL DEFAULT',
      'tags            TEXT[] NOT NULL DEFAULT',
      'entry_at        TIMESTAMPTZ NOT NULL DEFAULT now()',
      'archived_at     TIMESTAMPTZ',
      'metadata        JSONB',
      'created_at      TIMESTAMPTZ NOT NULL DEFAULT now()',
      'updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()',
    ];
    for (const col of required) {
      expect(sql).toContain(col);
    }
  });

  it('entry_kind CHECK constraint covers all 6 values', () => {
    expect(sql).toMatch(/CHECK \(entry_kind IN/);
    for (const kind of ['note', 'observation', 'result', 'decision', 'question', 'todo']) {
      expect(sql).toContain(`'${kind}'`);
    }
  });

  it('attached_urls + tags default to empty TEXT[]', () => {
    expect(sql).toMatch(/attached_urls\s+TEXT\[\] NOT NULL DEFAULT '\{\}'::text\[\]/);
    expect(sql).toMatch(/tags\s+TEXT\[\] NOT NULL DEFAULT '\{\}'::text\[\]/);
  });

  it('metadata defaults to empty JSONB', () => {
    expect(sql).toMatch(/metadata\s+JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
  });

  it('entry_at column allows server-default override (DEFAULT now())', () => {
    expect(sql).toMatch(/entry_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
  });

  it('archived_at is nullable (no NOT NULL)', () => {
    expect(sql).toMatch(/archived_at\s+TIMESTAMPTZ,/);
    // Defensive: ensure no `archived_at ... NOT NULL` pattern slipped in.
    expect(sql).not.toMatch(/archived_at\s+TIMESTAMPTZ\s+NOT NULL/);
  });

  it('does NOT declare a FK on experiment_id (platform v0.1.30 contract)', () => {
    // Scan the table body for any REFERENCES clause on the experiment_id
    // column. The platform contract drops cross-OS FKs; the BFF enforces
    // ownership via JOIN.
    expect(sql).not.toMatch(/experiment_id[^,]*REFERENCES/);
  });

  it('declares the per-experiment timeline index ordered by entry_at DESC', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_notebook_entries_experiment_entry_at_idx[\s\S]*?\(experiment_id, entry_at DESC\)/,
    );
  });

  it('declares the per-user author timeline index', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_notebook_entries_user_entry_at_idx[\s\S]*?\(user_id, entry_at DESC\)/,
    );
  });

  it('declares a GIN index on tags', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_notebook_entries_tags_gin[\s\S]*?USING GIN \(tags\)/,
    );
  });

  it('declares the partial open-todos index with the documented WHERE predicate', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_notebook_entries_open_todos_idx[\s\S]*?WHERE entry_kind = 'todo' AND archived_at IS NULL/,
    );
  });

  it('comments experiment_id with the ownership-enforcement contract', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_research_notebook_entries\.experiment_id/);
    expect(sql).toMatch(/No FK per platform v0\.1\.30 contract/);
    expect(sql).toMatch(/JOIN against agos_research_experiments/);
  });

  it('comments attached_urls with the MCP storage transfer doc reference', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_research_notebook_entries\.attached_urls/);
    expect(sql).toMatch(/docs\/architecture\/mcp-storage-transfer\.md/);
  });

  it('comments entry_at as separately editable from created_at', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_research_notebook_entries\.entry_at/);
    expect(sql).toMatch(/Editable separately from created_at/);
  });

  it('comments archived_at as the soft-archive marker', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_research_notebook_entries\.archived_at/);
    expect(sql).toMatch(/Soft-archive marker/);
  });

  it('downgrade drops indexes BEFORE the table', () => {
    const downIdx = sql.indexOf('_DOWNGRADE_SQL');
    expect(downIdx).toBeGreaterThan(0);
    const downBody = sql.slice(downIdx);
    const dropIdxPos = downBody.indexOf(
      'DROP INDEX IF EXISTS agos_research_notebook_entries_open_todos_idx',
    );
    const dropTablePos = downBody.indexOf(
      'DROP TABLE IF EXISTS agos_research_notebook_entries',
    );
    expect(dropIdxPos).toBeGreaterThan(0);
    expect(dropTablePos).toBeGreaterThan(0);
    expect(dropIdxPos).toBeLessThan(dropTablePos);
  });

  it('downgrade drops every created index', () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_notebook_entries_open_todos_idx/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_notebook_entries_tags_gin/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_notebook_entries_user_entry_at_idx/);
    expect(sql).toMatch(
      /DROP INDEX IF EXISTS agos_research_notebook_entries_experiment_entry_at_idx/,
    );
  });

  it('downgrade drops the table', () => {
    expect(sql).toMatch(/DROP TABLE IF EXISTS agos_research_notebook_entries/);
  });

  it('uses op.execute with the raw _UPGRADE_SQL constant (no text() bind risk)', () => {
    expect(sql).toMatch(/op\.execute\(_UPGRADE_SQL\)/);
    expect(sql).toMatch(/op\.execute\(_DOWNGRADE_SQL\)/);
  });

  it('does NOT wrap raw SQL in sqlalchemy.text() (bind-marker footgun)', () => {
    // The prior-phase footgun: text('...') parses ':word' as a bind marker.
    // We use plain string constants instead. Scope to the function bodies
    // (skip the docstring which mentions the anti-pattern in prose).
    const upgradeFn = sql.match(/def upgrade\(\) -> None:([\s\S]*?)def downgrade/);
    const downgradeFn = sql.match(/def downgrade\(\) -> None:([\s\S]*)/);
    expect(upgradeFn?.[1] ?? '').not.toMatch(/op\.execute\(text\(/);
    expect(downgradeFn?.[1] ?? '').not.toMatch(/op\.execute\(text\(/);
  });

  it('zero :<word> bind-marker patterns inside the SQL bodies', () => {
    // Extract everything between the r""" delimiters and scan for the
    // colon-prefixed identifier pattern. Allow `::` (Postgres cast).
    const bodies = sql.match(/r"""[\s\S]*?"""/g) ?? [];
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      // Strip `::word` casts, then look for `:word` patterns.
      const noCasts = body.replace(/::[A-Za-z_][A-Za-z0-9_]*/g, '');
      const matches = noCasts.match(/(?<![A-Za-z0-9:])[A-Za-z_]?:[A-Za-z_][A-Za-z0-9_]*/g);
      // Filter out URL/protocol false positives (`http:`, `https:`).
      const real = (matches ?? []).filter(
        (m) => !/^https?:/i.test(m) && !/^[a-z]+:\/\//i.test(m),
      );
      expect(real).toEqual([]);
    }
  });

  it('docstring documents the cross-ownership JOIN contract', () => {
    expect(sql).toMatch(/v0\.1\.30 platform contract/);
    // The reference may wrap across a docstring newline; match laxly.
    expect(sql).toMatch(/JOIN against[\s\S]{0,40}agos_research_experiments/);
  });

  it('docstring documents the soft-archive lifecycle', () => {
    expect(sql).toMatch(/soft-archive/);
    expect(sql).toMatch(/archived_at/);
  });

  it('docstring documents the editable entry_at design call', () => {
    expect(sql).toMatch(/entry_at.*editable/i);
    expect(sql).toMatch(/backfill/i);
  });

  it('module-level revision metadata wired (alembic discovery)', () => {
    expect(sql).toMatch(/from alembic import op/);
    expect(sql).toMatch(/branch_labels: Union\[str, Sequence\[str\], None\] = None/);
    expect(sql).toMatch(/depends_on: Union\[str, Sequence\[str\], None\] = None/);
  });
});
