/**
 * Maker OS — migration 0036 smoke test.
 *
 * Reads the SQL text directly (no alembic harness in vitest) and asserts the
 * locked structural properties:
 *
 *   - Down-revision points at 0035_maker_phase2.
 *   - The 3 new tables use CREATE TABLE IF NOT EXISTS.
 *   - All indexes use CREATE INDEX IF NOT EXISTS.
 *   - Foreign keys carry the right ON DELETE clauses
 *     (CASCADE on project, SET NULL on step_id).
 *   - URL-bearing columns carry the MCP-storage-transfer comment.
 *   - Downgrade drops indexes + tables in dependency order with no legacy
 *     precursor table.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0036_maker_phase3.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0036_maker_phase3', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0036_maker_phase3"/);
    expect(sql).toMatch(/down_revision: Union\[str, None\] = "0035_maker_phase2"/);
  });

  it('creates the 3 new tables idempotently', () => {
    for (const t of [
      'agos_maker_build_steps',
      'agos_maker_build_log_entries',
      'agos_maker_build_milestones',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`));
    }
  });

  it('creates indexes idempotently', () => {
    for (const idx of [
      'agos_maker_build_steps_project_ordinal_idx',
      'agos_maker_build_log_entries_project_created_idx',
      'agos_maker_build_log_entries_step_idx',
      'agos_maker_build_milestones_project_sort_idx',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}`));
    }
  });

  it('build_steps.project_id cascades from project deletion', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_build_steps[\s\S]+?project_id[\s\S]+?REFERENCES agos_maker_projects\(id\)\s+ON DELETE CASCADE/,
    );
  });

  it('build_log_entries.project_id cascades from project deletion', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_build_log_entries[\s\S]+?project_id[\s\S]+?REFERENCES agos_maker_projects\(id\)\s+ON DELETE CASCADE/,
    );
  });

  it('build_log_entries.step_id is FK with SET NULL', () => {
    expect(sql).toMatch(
      /step_id[\s\S]+?REFERENCES agos_maker_build_steps\(id\)\s+ON DELETE SET NULL/,
    );
  });

  it('build_milestones.project_id cascades from project deletion', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_build_milestones[\s\S]+?project_id[\s\S]+?REFERENCES agos_maker_projects\(id\)\s+ON DELETE CASCADE/,
    );
  });

  it('build_steps.ordinal is required (NOT NULL) and is in the project index', () => {
    expect(sql).toMatch(/ordinal\s+INT\s+NOT NULL/);
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_build_steps_project_ordinal_idx[\s\S]+?\(project_id, ordinal\)/,
    );
  });

  it('build_steps timestamps + metadata defaults wired', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_build_steps[\s\S]+?metadata\s+JSONB\s+NOT NULL DEFAULT '{}'::jsonb/,
    );
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_build_steps[\s\S]+?created_at\s+TIMESTAMPTZ\s+NOT NULL DEFAULT now\(\)/,
    );
  });

  it('build_log_entries.attached_urls is JSONB array defaulting to []', () => {
    expect(sql).toMatch(/attached_urls\s+JSONB\s+NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it('build_log_entries.body is NOT NULL', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_build_log_entries[\s\S]+?body\s+TEXT\s+NOT NULL/,
    );
  });

  it('build_log_entries created_at index orders DESC for feed', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_build_log_entries_project_created_idx[\s\S]+?\(project_id, created_at DESC\)/,
    );
  });

  it('build_milestones.sort_order defaults to 0 and is in the index', () => {
    expect(sql).toMatch(/sort_order\s+INT\s+NOT NULL DEFAULT 0/);
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_build_milestones_project_sort_idx[\s\S]+?\(project_id, sort_order\)/,
    );
  });

  it('attached_urls comment references MCP-storage-transfer doc', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_maker_build_log_entries\.attached_urls[\s\S]+?docs\/architecture\/mcp-storage-transfer\.md/,
    );
  });

  it('attached_urls kind enum is documented in the column comment', () => {
    expect(sql).toMatch(/photo\|video\|link\|file/);
  });

  it('downgrade drops new tables only (no legacy precursor)', () => {
    const downIdx = sql.indexOf('_DOWNGRADE_SQL');
    expect(downIdx).toBeGreaterThan(0);
    // No legacy table re-creation, unlike 0035.
    const downSection = sql.slice(downIdx);
    expect(downSection).not.toMatch(/CREATE TABLE/);
    expect(downSection).toMatch(/DROP TABLE IF EXISTS agos_maker_build_log_entries/);
    expect(downSection).toMatch(/DROP TABLE IF EXISTS agos_maker_build_milestones/);
    expect(downSection).toMatch(/DROP TABLE IF EXISTS agos_maker_build_steps/);
  });

  it('downgrade drops build_log_entries before build_steps (FK SET NULL dep)', () => {
    const downIdx = sql.indexOf('_DOWNGRADE_SQL');
    const section = sql.slice(downIdx);
    const dropEntries = section.indexOf('DROP TABLE IF EXISTS agos_maker_build_log_entries');
    const dropSteps = section.indexOf('DROP TABLE IF EXISTS agos_maker_build_steps');
    expect(dropEntries).toBeGreaterThan(-1);
    expect(dropSteps).toBeGreaterThan(dropEntries);
  });

  it('upgrade DDL has no Hephaestus references', () => {
    expect(sql.toLowerCase()).not.toMatch(/hephaestus/);
  });
});
