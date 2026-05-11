/**
 * Maker OS — migration 0033 smoke test.
 *
 * We don't run alembic in the vitest harness; instead we read the SQL text
 * directly and assert structural properties:
 *
 *   - Down-revision points at 0032_cyber_phase5.
 *   - The rename is idempotent (wrapped in a DO $$ ... pg_tables check $$).
 *   - Every new column uses ADD COLUMN IF NOT EXISTS.
 *   - The status CHECK constraint exists, covers all 8 values, and is dropped
 *     IF EXISTS before being added (so re-apply is safe).
 *   - The status remap UPDATE covers each legacy value (planning,
 *     in_progress, done) and falls through to 'concept' defensively.
 *   - The downgrade reverses the rename + drops the new columns.
 *
 * Matches the lightweight pattern used elsewhere for DDL regression: assert
 * on the SQL string rather than booting Postgres.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0033_maker_phase1.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0033_maker_phase1', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0033_maker_phase1"/);
    expect(sql).toMatch(/down_revision: Union\[str, None\] = "0032_cyber_phase5"/);
  });

  it('rename is idempotent (DO $$ + pg_tables check)', () => {
    // The block must check that the old table exists AND the new one does not.
    expect(sql).toMatch(/DO \$\$/);
    expect(sql).toMatch(/pg_tables/);
    expect(sql).toMatch(/agos_maker_builds/);
    expect(sql).toMatch(/RENAME TO agos_maker_projects/);
    expect(sql).toMatch(/AND NOT EXISTS[\s\S]+agos_maker_projects/);
  });

  it('all new columns use ADD COLUMN IF NOT EXISTS', () => {
    for (const col of [
      'cover_image_url',
      'target_completion_date',
      'team_size',
      'phase_progress',
      'metadata',
    ]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}`));
    }
  });

  it('phase_progress and metadata default to empty JSONB', () => {
    expect(sql).toMatch(/phase_progress\s+JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    expect(sql).toMatch(/metadata\s+JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
  });

  it('drops then adds the status CHECK constraint with all 8 values', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS agos_maker_projects_status_chk/);
    expect(sql).toMatch(/ADD CONSTRAINT agos_maker_projects_status_chk/);
    for (const v of [
      'concept',
      'design',
      'procurement',
      'fabrication',
      'assembly',
      'commissioning',
      'done',
      'archived',
    ]) {
      // Match the value appearing inside the CHECK list (allow surrounding quoting).
      expect(sql).toMatch(new RegExp(`'${v}'`));
    }
  });

  it('column comment for cover_image_url references MCP storage-transfer', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_maker_projects\.cover_image_url/);
    expect(sql).toMatch(/MCP-mediated storage transfer/);
  });

  it('remaps every legacy status to a new-taxonomy value', () => {
    expect(sql).toMatch(/'planning'\s+THEN 'concept'/);
    expect(sql).toMatch(/'in_progress'\s+THEN 'fabrication'/);
    expect(sql).toMatch(/'done'\s+THEN 'done'/);
    expect(sql).toMatch(/ELSE 'concept'/);
  });

  it('repoints the status default to "concept"', () => {
    expect(sql).toMatch(/ALTER COLUMN status SET DEFAULT 'concept'/);
  });

  it('downgrade reverses the rename and drops the new columns', () => {
    expect(sql).toMatch(/RENAME TO agos_maker_builds/);
    for (const col of [
      'cover_image_url',
      'target_completion_date',
      'team_size',
      'phase_progress',
      'metadata',
    ]) {
      expect(sql).toMatch(new RegExp(`DROP COLUMN IF EXISTS ${col}`));
    }
  });
});
