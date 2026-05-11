/**
 * Maker OS — migration 0040 smoke test.
 *
 * Reads the SQL text directly and asserts the locked structural
 * properties:
 *
 *   - Down-revision points at 0039_maker_phase6.
 *   - CREATE TABLE for agos_maker_coach_sessions with the locked
 *     columns + types.
 *   - CHECK constraint on `mode` enumerates the 4 locked values.
 *   - 3 indexes covering recent / project-partial / mode-filtered list
 *     paths.
 *   - Partial-index predicate matches the spec.
 *   - Per-OS UUIDs (project_id) carry NO FK by design — column comment
 *     cites the v0.1.30 platform contract.
 *   - Downgrade reverses the create (indexes first, then table).
 *   - No Hephaestus references anywhere.
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0040_maker_phase7.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0040_maker_phase7', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0040_maker_phase7"/);
    expect(sql).toMatch(/down_revision: Union\[str, None\] = "0039_maker_phase6"/);
  });

  it('creates agos_maker_coach_sessions idempotently', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS agos_maker_coach_sessions/);
  });

  it('declares the locked column set on agos_maker_coach_sessions', () => {
    for (const col of [
      'id          UUID',
      'user_id     UUID        NOT NULL',
      'project_id  UUID        NULL',
      'mode        TEXT        NOT NULL',
      'title       TEXT        NOT NULL',
      'messages    JSONB       NOT NULL DEFAULT',
      'metadata    JSONB       NOT NULL DEFAULT',
      'created_at  TIMESTAMPTZ NOT NULL DEFAULT now()',
      'updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()',
    ]) {
      expect(sql).toContain(col);
    }
  });

  it('declares the messages default as an empty JSONB array', () => {
    expect(sql).toMatch(/messages\s+JSONB\s+NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it('declares the metadata default as an empty JSONB object', () => {
    expect(sql).toMatch(/metadata\s+JSONB\s+NOT NULL DEFAULT '\{\}'::jsonb/);
  });

  it('adds the mode CHECK with the 4 locked values', () => {
    expect(sql).toMatch(/agos_maker_coach_sessions_mode_chk/);
    for (const v of [
      'procurement_advisor',
      'build_planner',
      'shop_safety',
      'general',
    ]) {
      expect(sql).toContain(`'${v}'`);
    }
  });

  it('creates the (user_id, updated_at DESC) recent-sessions index', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_coach_sessions_user_updated_idx/,
    );
    expect(sql).toMatch(/ON agos_maker_coach_sessions \(user_id, updated_at DESC\)/);
  });

  it('creates the per-project partial index (project_id, updated_at DESC) WHERE project_id IS NOT NULL', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_coach_sessions_project_updated_idx/,
    );
    expect(sql).toMatch(/ON agos_maker_coach_sessions \(project_id, updated_at DESC\)/);
    expect(sql).toMatch(/WHERE project_id IS NOT NULL/);
  });

  it('creates the mode-filtered (user_id, mode, updated_at DESC) index', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_coach_sessions_user_mode_updated_idx/,
    );
    expect(sql).toMatch(
      /ON agos_maker_coach_sessions \(user_id, mode, updated_at DESC\)/,
    );
  });

  it('does NOT declare a foreign key on project_id (per-OS UUID convention)', () => {
    // Anchor on the table body and assert that the project_id column is
    // not FK'd — no REFERENCES on the project_id line.
    const projectIdLine = sql
      .split('\n')
      .find((l) => /^\s*project_id\s+UUID\s+NULL/.test(l));
    expect(projectIdLine, 'project_id column should be present').toBeTruthy();
    expect(projectIdLine).not.toMatch(/REFERENCES/);
  });

  it('comments the project_id column with the v0.1.30 contract note', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_maker_coach_sessions\.project_id IS/);
    expect(sql).toMatch(/v0\.1\.30/);
    expect(sql).toMatch(/per-OS project UUID/);
  });

  it('comments the mode column with the 4-value taxonomy', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_maker_coach_sessions\.mode IS/);
  });

  it('comments the messages column describing the JSONB shape', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN agos_maker_coach_sessions\.messages IS/);
    expect(sql).toMatch(/JSONB array/);
  });

  it('downgrade drops indexes first then the table', () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_maker_coach_sessions_user_mode_updated_idx/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_maker_coach_sessions_project_updated_idx/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS agos_maker_coach_sessions_user_updated_idx/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS agos_maker_coach_sessions/);
  });

  it('downgrade DROP TABLE comes after the index drops', () => {
    const dropTable = sql.search(/DROP TABLE IF EXISTS agos_maker_coach_sessions/);
    const dropIdx1 = sql.search(/DROP INDEX IF EXISTS agos_maker_coach_sessions_user_mode_updated_idx/);
    expect(dropTable).toBeGreaterThan(dropIdx1);
  });

  it('makes no Hephaestus reference', () => {
    expect(sql.toLowerCase()).not.toContain('hephaestus');
  });

  it('declares the upgrade SQL block', () => {
    expect(sql).toMatch(/_UPGRADE_SQL = r"""/);
  });

  it('declares the downgrade SQL block', () => {
    expect(sql).toMatch(/_DOWNGRADE_SQL = r"""/);
  });

  it('exposes upgrade() and downgrade() functions', () => {
    expect(sql).toMatch(/def upgrade\(\) -> None:/);
    expect(sql).toMatch(/def downgrade\(\) -> None:/);
  });
});
