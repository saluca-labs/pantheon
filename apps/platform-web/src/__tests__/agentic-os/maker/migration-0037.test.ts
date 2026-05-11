/**
 * Maker OS — migration 0037 smoke test.
 *
 * Reads the SQL text directly and asserts the locked structural properties:
 *
 *   - Down-revision points at 0036_maker_phase3.
 *   - 4 new tables use CREATE TABLE IF NOT EXISTS.
 *   - All indexes use CREATE INDEX IF NOT EXISTS.
 *   - kind / status / event_kind CHECK constraints carry the locked enums.
 *   - URL-bearing columns reference the MCP-storage-transfer doc.
 *   - Unique constraint on (project_id, tool_id) is in place.
 *   - Downgrade drops tables in dependency order.
 *   - No Hephaestus references anywhere.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0037_maker_phase4.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0037_maker_phase4', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0037_maker_phase4"/);
    expect(sql).toMatch(/down_revision: Union\[str, None\] = "0036_maker_phase3"/);
  });

  it('creates the 4 new tables idempotently', () => {
    for (const t of [
      'agos_maker_tools',
      'agos_maker_tool_consumables',
      'agos_maker_tool_maintenance',
      'agos_maker_project_tools',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`));
    }
  });

  it('creates indexes idempotently', () => {
    for (const idx of [
      'agos_maker_tools_user_status_idx',
      'agos_maker_tools_tags_gin_idx',
      'agos_maker_tool_consumables_tool_idx',
      'agos_maker_tool_maintenance_tool_performed_idx',
      'agos_maker_project_tools_project_idx',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}`));
    }
  });

  it('agos_maker_tools.user_id is NOT NULL', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_tools[\s\S]+?user_id\s+UUID\s+NOT NULL/,
    );
  });

  it('agos_maker_tools.kind CHECK enumerates the 9 locked values', () => {
    expect(sql).toMatch(/agos_maker_tools_kind_chk/);
    for (const v of [
      'cnc',
      '3d_printer',
      'laser',
      'soldering',
      'oscilloscope',
      'multimeter',
      'handtool',
      'powertool',
      'other',
    ]) {
      expect(sql).toContain(`'${v}'`);
    }
  });

  it('agos_maker_tools.status CHECK enumerates the 3 locked values and defaults to active', () => {
    expect(sql).toMatch(/agos_maker_tools_status_chk/);
    expect(sql).toMatch(
      /status\s+TEXT\s+NOT NULL DEFAULT 'active'/,
    );
    for (const v of ['active', 'down', 'retired']) {
      expect(sql).toContain(`'${v}'`);
    }
  });

  it('agos_maker_tool_consumables cascades from tool deletion', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_tool_consumables[\s\S]+?tool_id[\s\S]+?REFERENCES agos_maker_tools\(id\)\s+ON DELETE CASCADE/,
    );
  });

  it('agos_maker_tool_maintenance cascades from tool deletion', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_tool_maintenance[\s\S]+?tool_id[\s\S]+?REFERENCES agos_maker_tools\(id\)\s+ON DELETE CASCADE/,
    );
  });

  it('agos_maker_tool_maintenance.event_kind CHECK enumerates the 5 locked values', () => {
    expect(sql).toMatch(/agos_maker_tool_maintenance_event_kind_chk/);
    for (const v of ['cleaned', 'serviced', 'calibrated', 'repaired', 'inspected']) {
      expect(sql).toContain(`'${v}'`);
    }
  });

  it('agos_maker_tool_maintenance is indexed by performed_at DESC', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_tool_maintenance_tool_performed_idx[\s\S]+?\(tool_id, performed_at DESC\)/,
    );
  });

  it('agos_maker_project_tools FKs both project and tool with CASCADE', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_project_tools[\s\S]+?project_id[\s\S]+?REFERENCES agos_maker_projects\(id\)\s+ON DELETE CASCADE/,
    );
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_project_tools[\s\S]+?tool_id[\s\S]+?REFERENCES agos_maker_tools\(id\)\s+ON DELETE CASCADE/,
    );
  });

  it('agos_maker_project_tools has UNIQUE (project_id, tool_id)', () => {
    expect(sql).toMatch(/agos_maker_project_tools_project_tool_unique/);
    expect(sql).toMatch(
      /UNIQUE\s*\(project_id,\s*tool_id\)/,
    );
  });

  it('agos_maker_project_tools.required defaults to true', () => {
    expect(sql).toMatch(/required\s+BOOLEAN\s+NOT NULL DEFAULT true/);
  });

  it('image_url comment references MCP-storage-transfer doc', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_maker_tools\.image_url[\s\S]+?docs\/architecture\/mcp-storage-transfer\.md/,
    );
  });

  it('datasheet_url comment references MCP-storage-transfer doc', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_maker_tools\.datasheet_url[\s\S]+?docs\/architecture\/mcp-storage-transfer\.md/,
    );
  });

  it('manual_url comment references MCP-storage-transfer doc', () => {
    expect(sql).toMatch(
      /COMMENT ON COLUMN agos_maker_tools\.manual_url[\s\S]+?docs\/architecture\/mcp-storage-transfer\.md/,
    );
  });

  it('tags is a TEXT[] with GIN index on agos_maker_tools', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS agos_maker_tools[\s\S]+?tags\s+TEXT\[\]\s+NOT NULL DEFAULT/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS agos_maker_tools_tags_gin_idx[\s\S]+?USING GIN \(tags\)/,
    );
  });

  it('agos_maker_tool_consumables has hours_remaining and max_hours as NUMERIC', () => {
    expect(sql).toMatch(/hours_remaining\s+NUMERIC/);
    expect(sql).toMatch(/max_hours\s+NUMERIC/);
  });

  it('downgrade drops project_tools first (cross-FK dependency)', () => {
    const downIdx = sql.indexOf('_DOWNGRADE_SQL');
    expect(downIdx).toBeGreaterThan(0);
    const section = sql.slice(downIdx);
    const dropProjectTools = section.indexOf('DROP TABLE IF EXISTS agos_maker_project_tools');
    const dropMaintenance = section.indexOf('DROP TABLE IF EXISTS agos_maker_tool_maintenance');
    const dropConsumables = section.indexOf('DROP TABLE IF EXISTS agos_maker_tool_consumables');
    const dropTools = section.indexOf('DROP TABLE IF EXISTS agos_maker_tools');
    expect(dropProjectTools).toBeGreaterThan(-1);
    expect(dropMaintenance).toBeGreaterThan(dropProjectTools);
    expect(dropConsumables).toBeGreaterThan(dropProjectTools);
    expect(dropTools).toBeGreaterThan(dropMaintenance);
    expect(dropTools).toBeGreaterThan(dropConsumables);
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
