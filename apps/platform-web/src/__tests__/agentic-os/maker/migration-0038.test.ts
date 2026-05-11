/**
 * Maker OS — migration 0038 smoke test.
 *
 * Reads the SQL text directly and asserts the locked structural properties:
 *
 *   - Down-revision points at 0037_maker_phase4.
 *   - 3 new tables use CREATE TABLE IF NOT EXISTS.
 *   - All indexes use CREATE INDEX IF NOT EXISTS.
 *   - spec-sheet kind CHECK + attachment-exclusivity CHECK present.
 *   - reference kind CHECK present.
 *   - URL-bearing columns reference the MCP-storage-transfer doc.
 *   - Unique constraint on (project_id, reference_id) is in place.
 *   - Partial indexes on part_id / tool_id / project_id present.
 *   - project_id is NOT a FK on either spec_sheets or project_references
 *     (per platform contract).
 *   - Downgrade drops tables in reverse FK order.
 *   - No Hephaestus references anywhere.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0038_maker_phase5.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0038_maker_phase5', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0038_maker_phase5"/);
    expect(sql).toMatch(/down_revision: Union\[str, None\] = "0037_maker_phase4"/);
  });

  it('creates the 3 new tables idempotently', () => {
    for (const t of [
      'agos_maker_spec_sheets',
      'agos_maker_references',
      'agos_maker_project_references',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`));
    }
  });

  it('creates indexes idempotently', () => {
    for (const idx of [
      'agos_maker_spec_sheets_user_kind_idx',
      'agos_maker_spec_sheets_part_idx',
      'agos_maker_spec_sheets_tool_idx',
      'agos_maker_spec_sheets_project_idx',
      'agos_maker_spec_sheets_tags_gin_idx',
      'agos_maker_references_user_kind_idx',
      'agos_maker_references_tags_gin_idx',
      'agos_maker_project_references_project_idx',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}`));
    }
  });

  it('agos_maker_spec_sheets.user_id is NOT NULL', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_spec_sheets[\s\S]+?user_id\s+UUID\s+NOT NULL/,
    );
  });

  it('agos_maker_spec_sheets.kind CHECK enumerates the 6 locked values', () => {
    expect(sql).toMatch(/agos_maker_spec_sheets_kind_chk/);
    for (const v of [
      'datasheet',
      'spec',
      'manual',
      'drawing',
      'certificate',
      'other',
    ]) {
      expect(sql).toContain(`'${v}'`);
    }
  });

  it('agos_maker_spec_sheets kind defaults to datasheet', () => {
    expect(sql).toMatch(/kind\s+TEXT\s+NOT NULL DEFAULT 'datasheet'/);
  });

  it('agos_maker_spec_sheets carries the attachment-exclusivity CHECK', () => {
    expect(sql).toMatch(/agos_maker_spec_sheets_attachment_chk/);
    expect(sql).toMatch(
      /CASE WHEN part_id\s+IS NOT NULL THEN 1 ELSE 0 END/,
    );
    expect(sql).toMatch(
      /CASE WHEN tool_id\s+IS NOT NULL THEN 1 ELSE 0 END/,
    );
    expect(sql).toMatch(
      /CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END/,
    );
    expect(sql).toMatch(/=\s*1/);
  });

  it('agos_maker_spec_sheets cascades from part deletion', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_spec_sheets[\s\S]+?part_id[\s\S]+?REFERENCES agos_maker_part_catalog\(id\)\s+ON DELETE CASCADE/,
    );
  });

  it('agos_maker_spec_sheets cascades from tool deletion', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_spec_sheets[\s\S]+?tool_id[\s\S]+?REFERENCES agos_maker_tools\(id\)\s+ON DELETE CASCADE/,
    );
  });

  it('agos_maker_spec_sheets.project_id is NOT a FK', () => {
    // Capture just the spec_sheets CREATE block.
    const tableMatch = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_maker_spec_sheets[\s\S]+?\);/,
    );
    expect(tableMatch).not.toBeNull();
    const body = tableMatch![0];
    // project_id column line should NOT reference agos_maker_projects.
    expect(body).not.toMatch(/project_id[^,]*REFERENCES agos_maker_projects/);
  });

  it('partial indexes on spec_sheets are gated by IS NOT NULL', () => {
    expect(sql).toMatch(
      /agos_maker_spec_sheets_part_idx[\s\S]+?WHERE part_id IS NOT NULL/,
    );
    expect(sql).toMatch(
      /agos_maker_spec_sheets_tool_idx[\s\S]+?WHERE tool_id IS NOT NULL/,
    );
    expect(sql).toMatch(
      /agos_maker_spec_sheets_project_idx[\s\S]+?WHERE project_id IS NOT NULL/,
    );
  });

  it('agos_maker_references.kind CHECK enumerates the 8 locked values', () => {
    expect(sql).toMatch(/agos_maker_references_kind_chk/);
    for (const v of [
      'paper',
      'tutorial',
      'standard',
      'article',
      'video',
      'book',
      'link',
      'other',
    ]) {
      expect(sql).toContain(`'${v}'`);
    }
  });

  it('agos_maker_references kind defaults to link', () => {
    expect(sql).toMatch(/kind\s+TEXT\s+NOT NULL DEFAULT 'link'/);
  });

  it('agos_maker_project_references FKs the reference with CASCADE', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_project_references[\s\S]+?reference_id[\s\S]+?REFERENCES agos_maker_references\(id\)\s+ON DELETE CASCADE/,
    );
  });

  it('agos_maker_project_references has UNIQUE (project_id, reference_id)', () => {
    expect(sql).toMatch(
      /agos_maker_project_references_project_reference_unique/,
    );
    expect(sql).toMatch(/UNIQUE\s*\(project_id,\s*reference_id\)/);
  });

  it('agos_maker_project_references.project_id is NOT a FK', () => {
    const tableMatch = sql.match(
      /CREATE TABLE IF NOT EXISTS agos_maker_project_references[\s\S]+?\);/,
    );
    expect(tableMatch).not.toBeNull();
    const body = tableMatch![0];
    expect(body).not.toMatch(/project_id[^,]*REFERENCES agos_maker_projects/);
  });

  it('agos_maker_spec_sheets.url comment references MCP-storage-transfer doc', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_maker_spec_sheets\.url[\s\S]+?docs\/architecture\/mcp-storage-transfer\.md/,
    );
  });

  it('agos_maker_references.url comment references MCP-storage-transfer doc', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_maker_references\.url[\s\S]+?docs\/architecture\/mcp-storage-transfer\.md/,
    );
  });

  it('tags is a TEXT[] with GIN index on agos_maker_spec_sheets', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_spec_sheets[\s\S]+?tags\s+TEXT\[\]\s+NOT NULL DEFAULT/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_spec_sheets_tags_gin_idx[\s\S]+?USING GIN \(tags\)/,
    );
  });

  it('tags is a TEXT[] with GIN index on agos_maker_references', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_references[\s\S]+?tags\s+TEXT\[\]\s+NOT NULL DEFAULT/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_references_tags_gin_idx[\s\S]+?USING GIN \(tags\)/,
    );
  });

  it('downgrade drops project_references first (depends on references)', () => {
    const downIdx = sql.indexOf('_DOWNGRADE_SQL');
    expect(downIdx).toBeGreaterThan(0);
    const section = sql.slice(downIdx);
    const dropProjectRefs = section.indexOf(
      'DROP TABLE IF EXISTS agos_maker_project_references',
    );
    const dropRefs = section.indexOf('DROP TABLE IF EXISTS agos_maker_references');
    const dropSheets = section.indexOf('DROP TABLE IF EXISTS agos_maker_spec_sheets');
    expect(dropProjectRefs).toBeGreaterThan(-1);
    expect(dropRefs).toBeGreaterThan(dropProjectRefs);
    expect(dropSheets).toBeGreaterThan(-1);
  });

  it('downgrade drops new tables only (no legacy precursor)', () => {
    const downIdx = sql.indexOf('_DOWNGRADE_SQL');
    const section = sql.slice(downIdx);
    expect(section).not.toMatch(/CREATE TABLE/);
  });

  it('upgrade DDL has no Hephaestus references', () => {
    expect(sql.toLowerCase()).not.toMatch(/hephaestus/);
  });
});
