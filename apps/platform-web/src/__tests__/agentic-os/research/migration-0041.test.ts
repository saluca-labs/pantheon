/**
 * Research OS — migration 0041 smoke test.
 *
 * We don't run alembic in the vitest harness; instead we read the SQL text
 * directly and assert structural properties:
 *
 *   - Down-revision points at 0040_maker_phase7.
 *   - The FK drop is done dynamically by name lookup (pg_constraint).
 *   - hypothesis_id NOT NULL is relaxed.
 *   - Every new column uses ADD COLUMN IF NOT EXISTS.
 *   - phase_progress + metadata default to empty JSONB; tags default to
 *     an empty TEXT[].
 *   - The status CHECK exists and covers all 6 new values; the drop+add
 *     pair is idempotent.
 *   - The status remap UPDATE covers each legacy value (planned, running,
 *     done) and the new values are passthroughs; ELSE falls through to
 *     'planning'.
 *   - Indexes: (user_id, status, updated_at DESC), GIN on tags, partial
 *     (archived_at) WHERE archived_at IS NOT NULL.
 *   - The downgrade reverses the rename / drops the new columns /
 *     reasserts hypothesis_id NOT NULL + FK CASCADE.
 *   - The docstring documents the relaxed hypothesis_id semantics.
 *
 * Matches the lightweight pattern used by Maker's migration-0033 test.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0041_research_phase1.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0041_research_phase1', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0041_research_phase1"/);
    expect(sql).toMatch(/down_revision: Union\[str, None\] = "0040_maker_phase7"/);
  });

  it('docstring documents the relaxed hypothesis_id semantics', () => {
    expect(sql).toMatch(/Legacy ``hypothesis_id`` semantics being relaxed/);
    expect(sql).toMatch(/NOT NULL/);
    expect(sql).toMatch(/ON DELETE CASCADE/);
    expect(sql).toMatch(/nullable UUID/);
  });

  it('drops the legacy hypothesis_id FK via pg_constraint lookup', () => {
    // We don't hardcode the FK name; the migration looks it up by table +
    // attnum so the drop survives differing Postgres versions.
    expect(sql).toMatch(/FROM pg_constraint/);
    expect(sql).toMatch(/'agos_research_experiments'::regclass/);
    expect(sql).toMatch(/DROP CONSTRAINT %I/);
  });

  it('relaxes hypothesis_id NOT NULL', () => {
    expect(sql).toMatch(/ALTER COLUMN hypothesis_id DROP NOT NULL/);
  });

  it('comments hypothesis_id to flag it as a Phase 3 legacy pointer', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_research_experiments\.hypothesis_id/);
    expect(sql).toMatch(/Phase 3/);
    expect(sql).toMatch(/agos_research_experiment_hypotheses/);
  });

  it('all new project-shape columns use ADD COLUMN IF NOT EXISTS', () => {
    for (const col of [
      'cover_image_url',
      'description',
      'target_completion_date',
      'team_size',
      'tags',
      'phase_progress',
      'archived_at',
      'metadata',
    ]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}`));
    }
  });

  it('description defaults to empty string NOT NULL', () => {
    expect(sql).toMatch(/description\s+TEXT NOT NULL DEFAULT ''/);
  });

  it('tags defaults to empty TEXT[] NOT NULL', () => {
    expect(sql).toMatch(/tags\s+TEXT\[\] NOT NULL DEFAULT '\{\}'::text\[\]/);
  });

  it('phase_progress + metadata default to empty JSONB NOT NULL', () => {
    expect(sql).toMatch(/phase_progress\s+JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    expect(sql).toMatch(/metadata\s+JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
  });

  it('archived_at is nullable TIMESTAMPTZ', () => {
    expect(sql).toMatch(/archived_at\s+TIMESTAMPTZ/);
  });

  it('column comment for cover_image_url references MCP storage-transfer', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_research_experiments\.cover_image_url/);
    expect(sql).toMatch(/MCP-mediated storage transfer/);
    expect(sql).toMatch(/docs\/architecture\/mcp-storage-transfer/);
  });

  it('column comment documents phase_progress shape', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_research_experiments\.phase_progress/);
    for (const phase of ['planning', 'running', 'analysis', 'writeup', 'published']) {
      expect(sql).toMatch(new RegExp(phase));
    }
  });

  it('column comment documents archived_at as the soft-archive marker', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_research_experiments\.archived_at/);
    expect(sql).toMatch(/[Ss]oft.archive/);
  });

  it('drops then adds the status CHECK constraint with all 6 values', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS agos_research_experiments_status_chk/);
    expect(sql).toMatch(/ADD CONSTRAINT agos_research_experiments_status_chk/);
    for (const v of [
      'planning',
      'running',
      'analysis',
      'writeup',
      'published',
      'archived',
    ]) {
      expect(sql).toMatch(new RegExp(`'${v}'`));
    }
  });

  it('remaps every legacy status to a new-taxonomy value', () => {
    expect(sql).toMatch(/'planned'\s+THEN 'planning'/);
    expect(sql).toMatch(/'running'\s+THEN 'running'/);
    expect(sql).toMatch(/'done'\s+THEN 'published'/);
    expect(sql).toMatch(/ELSE 'planning'/);
  });

  it('repoints the status default to "planning"', () => {
    expect(sql).toMatch(/ALTER COLUMN status SET DEFAULT 'planning'/);
  });

  it('creates the user+status+updated_at index', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiments_user_status_idx/,
    );
    expect(sql).toMatch(/\(user_id, status, updated_at DESC\)/);
  });

  it('creates a GIN index on tags', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS agos_research_experiments_tags_gin/);
    expect(sql).toMatch(/USING GIN \(tags\)/);
  });

  it('creates a partial index on archived_at', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS agos_research_experiments_archived_idx/);
    expect(sql).toMatch(/WHERE archived_at IS NOT NULL/);
  });

  it('drops the legacy hypothesis_idx so reads stop scanning it', () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_experiments_hypothesis_idx/);
  });

  it('downgrade reverses the status taxonomy widening', () => {
    expect(sql).toMatch(/'planning'\s+THEN 'planned'/);
    expect(sql).toMatch(/'published'\s+THEN 'done'/);
    expect(sql).toMatch(/'analysis'\s+THEN 'running'/);
    expect(sql).toMatch(/'writeup'\s+THEN 'running'/);
    expect(sql).toMatch(/'archived'\s+THEN 'planned'/);
  });

  it('downgrade restores legacy status default and drops the new constraint', () => {
    expect(sql).toMatch(/ALTER COLUMN status SET DEFAULT 'planned'/);
    // The drop must appear in both directions for idempotency.
    const drops = sql.match(/DROP CONSTRAINT IF EXISTS agos_research_experiments_status_chk/g);
    expect(drops?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('downgrade drops the new indexes', () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_experiments_archived_idx/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_experiments_tags_gin/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_research_experiments_user_status_idx/);
  });

  it('downgrade restores the legacy hypothesis_idx', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_research_experiments_hypothesis_idx/,
    );
  });

  it('downgrade drops every new column', () => {
    for (const col of [
      'cover_image_url',
      'description',
      'target_completion_date',
      'team_size',
      'tags',
      'phase_progress',
      'archived_at',
      'metadata',
    ]) {
      expect(sql).toMatch(new RegExp(`DROP COLUMN IF EXISTS ${col}`));
    }
  });

  it('downgrade backfills NULL hypothesis_id rows before re-asserting NOT NULL', () => {
    expect(sql).toMatch(/WHERE e\.hypothesis_id IS NULL/);
    expect(sql).toMatch(/ALTER COLUMN hypothesis_id SET NOT NULL/);
  });

  it('downgrade restores the legacy hypothesis_id FK with CASCADE', () => {
    expect(sql).toMatch(/agos_research_experiments_hypothesis_id_fkey/);
    expect(sql).toMatch(/REFERENCES agos_research_hypotheses\(id\)/);
    expect(sql).toMatch(/ON DELETE CASCADE/);
  });
});
