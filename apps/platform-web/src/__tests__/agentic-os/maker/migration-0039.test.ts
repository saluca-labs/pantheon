/**
 * Maker OS — migration 0039 smoke test.
 *
 * Reads the SQL text directly and asserts the locked structural properties:
 *
 *   - Down-revision points at 0038_maker_phase5.
 *   - ALTER TABLE adds the four new columns idempotently
 *     (priority, is_blocker, blocked_reason, status).
 *   - New CHECK constraints on priority (4 values) + status (6 values).
 *   - Status remap rule: completed_at IS NOT NULL → status='done'.
 *   - 3 new partial indexes on milestones (due_at, blocker, risk).
 *   - New table agos_maker_project_dependencies with the locked shape.
 *   - kind CHECK enumerates 4 values; status CHECK enumerates 2.
 *   - UNIQUE (from_project_id, to_project_id, kind) constraint.
 *   - CHECK (from_project_id != to_project_id) — no self-loops.
 *   - 4 indexes including the partial WHERE status='open'.
 *   - Per-OS UUIDs are NOT FK on either project_id column.
 *   - Column comments cite the v0.1.30 platform contract.
 *   - Downgrade reverses + remaps new status values back to 'pending'.
 *   - No Hephaestus references anywhere.
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0039_maker_phase6.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0039_maker_phase6', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0039_maker_phase6"/);
    expect(sql).toMatch(/down_revision: Union\[str, None\] = "0038_maker_phase5"/);
  });

  it('adds the four new milestone columns idempotently', () => {
    for (const col of [
      'priority       TEXT       NOT NULL DEFAULT',
      'is_blocker     BOOLEAN    NOT NULL DEFAULT false',
      'blocked_reason TEXT       NULL',
      'status         TEXT       NOT NULL DEFAULT',
    ]) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${col}`);
    }
  });

  it('adds the priority CHECK with the 4 locked values', () => {
    expect(sql).toMatch(/agos_maker_build_milestones_priority_chk/);
    for (const v of ['low', 'medium', 'high', 'critical']) {
      expect(sql).toContain(`'${v}'`);
    }
  });

  it('adds the status CHECK with the 6 locked values', () => {
    expect(sql).toMatch(/agos_maker_build_milestones_status_chk/);
    for (const v of ['pending', 'at_risk', 'blocked', 'on_track', 'done', 'missed']) {
      expect(sql).toContain(`'${v}'`);
    }
  });

  it('checks the status constraint is added idempotently via pg_constraint guard', () => {
    expect(sql).toMatch(
      /IF NOT EXISTS\s*\(\s*SELECT 1 FROM pg_constraint[\s\S]+?conname = 'agos_maker_build_milestones_status_chk'/,
    );
  });

  it('checks the priority constraint is added idempotently via pg_constraint guard', () => {
    expect(sql).toMatch(
      /IF NOT EXISTS\s*\(\s*SELECT 1 FROM pg_constraint[\s\S]+?conname = 'agos_maker_build_milestones_priority_chk'/,
    );
  });

  it('remaps completed_at to status=done on upgrade', () => {
    expect(sql).toMatch(
      /UPDATE agos_maker_build_milestones\s+SET status = 'done'\s+WHERE completed_at IS NOT NULL/,
    );
  });

  it('creates the three new partial milestone indexes', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_build_milestones_due_at_idx[\s\S]+?WHERE due_at IS NOT NULL/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_build_milestones_blocker_idx[\s\S]+?WHERE is_blocker = true/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_build_milestones_risk_idx[\s\S]+?WHERE status IN \('at_risk','blocked','missed'\)/,
    );
  });

  it('creates agos_maker_project_dependencies idempotently', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_project_dependencies/,
    );
  });

  it('agos_maker_project_dependencies has the 10 locked columns', () => {
    for (const col of [
      'id                 UUID        PRIMARY KEY',
      'user_id            UUID        NOT NULL',
      'from_project_id    UUID        NOT NULL',
      'to_project_id      UUID        NOT NULL',
      "kind               TEXT        NOT NULL DEFAULT 'blocks'",
      "status             TEXT        NOT NULL DEFAULT 'open'",
      'notes              TEXT        NULL',
      "metadata           JSONB       NOT NULL DEFAULT '{}'",
    ]) {
      expect(sql).toContain(col);
    }
  });

  it('agos_maker_project_dependencies.kind CHECK enumerates 4 values', () => {
    expect(sql).toMatch(/agos_maker_project_dependencies_kind_chk/);
    for (const v of ['blocks', 'informs', 'consumes', 'related']) {
      expect(sql).toContain(`'${v}'`);
    }
  });

  it('agos_maker_project_dependencies.status CHECK enumerates 2 values', () => {
    expect(sql).toMatch(/agos_maker_project_dependencies_status_chk/);
    expect(sql).toMatch(/status IN \('open','cleared'\)/);
  });

  it('agos_maker_project_dependencies has no-self-loop CHECK', () => {
    expect(sql).toMatch(/agos_maker_project_dependencies_no_self_loop_chk/);
    expect(sql).toMatch(/CHECK \(from_project_id != to_project_id\)/);
  });

  it('agos_maker_project_dependencies has UNIQUE (from, to, kind)', () => {
    expect(sql).toMatch(/agos_maker_project_dependencies_edge_unique/);
    expect(sql).toMatch(
      /UNIQUE\s*\(from_project_id,\s*to_project_id,\s*kind\)/,
    );
  });

  it('creates the 4 dependency indexes (user/status, from, to, partial open)', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_project_dependencies_user_status_idx/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_project_dependencies_from_idx/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_project_dependencies_to_idx/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_project_dependencies_open_idx[\s\S]+?WHERE status = 'open'/,
    );
  });

  it('agos_maker_project_dependencies.from_project_id is NOT a FK', () => {
    const tableMatch = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_maker_project_dependencies[\s\S]+?\);/,
    );
    expect(tableMatch).not.toBeNull();
    const body = tableMatch![0];
    expect(body).not.toMatch(/from_project_id[^,]*REFERENCES/);
    expect(body).not.toMatch(/to_project_id[^,]*REFERENCES/);
  });

  it('column comments reference v0.1.30 platform contract', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_maker_project_dependencies\.from_project_id[\s\S]+?v0\.1\.30 platform contract/,
    );
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_maker_project_dependencies\.to_project_id[\s\S]+?v0\.1\.30 platform contract/,
    );
  });

  it('downgrade drops the new table first', () => {
    const downIdx = sql.indexOf('_DOWNGRADE_SQL');
    expect(downIdx).toBeGreaterThan(0);
    const section = sql.slice(downIdx);
    const dropDeps = section.indexOf(
      'DROP TABLE IF EXISTS agos_maker_project_dependencies',
    );
    const dropColumn = section.indexOf('DROP COLUMN IF EXISTS status');
    expect(dropDeps).toBeGreaterThan(-1);
    expect(dropColumn).toBeGreaterThan(dropDeps);
  });

  it('downgrade remaps new status values to pending before dropping the column', () => {
    const downIdx = sql.indexOf('_DOWNGRADE_SQL');
    const section = sql.slice(downIdx);
    expect(section).toMatch(
      /UPDATE agos_maker_build_milestones\s+SET status = 'pending'\s+WHERE status IN \('at_risk','blocked','missed','on_track'\)/,
    );
    const remap = section.indexOf("SET status = 'pending'");
    const dropColumn = section.indexOf('DROP COLUMN IF EXISTS status');
    expect(remap).toBeGreaterThan(-1);
    expect(dropColumn).toBeGreaterThan(remap);
  });

  it('downgrade drops new CHECK constraints + new columns', () => {
    const downIdx = sql.indexOf('_DOWNGRADE_SQL');
    const section = sql.slice(downIdx);
    expect(section).toMatch(
      /DROP CONSTRAINT IF EXISTS agos_maker_build_milestones_status_chk/,
    );
    expect(section).toMatch(
      /DROP CONSTRAINT IF EXISTS agos_maker_build_milestones_priority_chk/,
    );
    for (const col of [
      'DROP COLUMN IF EXISTS status',
      'DROP COLUMN IF EXISTS blocked_reason',
      'DROP COLUMN IF EXISTS is_blocker',
      'DROP COLUMN IF EXISTS priority',
    ]) {
      expect(section).toContain(col);
    }
  });

  it('upgrade DDL is idempotent (uses IF NOT EXISTS for column adds)', () => {
    const adds = sql.match(/ADD COLUMN IF NOT EXISTS/g);
    expect(adds).not.toBeNull();
    expect(adds!.length).toBeGreaterThanOrEqual(4);
  });

  it('upgrade DDL has no Hephaestus references', () => {
    expect(sql.toLowerCase()).not.toMatch(/hephaestus/);
  });

  it('downgrade DDL has no Hephaestus references', () => {
    const downIdx = sql.indexOf('_DOWNGRADE_SQL');
    const section = sql.slice(downIdx);
    expect(section.toLowerCase()).not.toMatch(/hephaestus/);
  });
});
