/**
 * Maker OS — migration 0035 smoke test.
 *
 * Reads the SQL text directly (no alembic harness in vitest) and asserts the
 * locked structural properties:
 *
 *   - Down-revision points at 0034_agos_audit_drop_project_fk.
 *   - Each of the 5 new tables uses CREATE TABLE IF NOT EXISTS.
 *   - Foreign keys carry the right ON DELETE clauses.
 *   - tags column on catalog uses TEXT[] with a GIN index.
 *   - Category + priority CHECK constraints cover every locked value.
 *   - URL columns carry the MCP-storage-transfer comment.
 *   - The data-migration block:
 *       a. Is wrapped in a pg_tables existence check so re-applies are safe.
 *       b. Inserts catalog rows DISTINCT by (user_id, name, category, unit).
 *       c. Inserts one BOM line per legacy parts row.
 *       d. DROPs the legacy agos_maker_parts table.
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../../../packages/database/alembic/versions/0035_maker_phase2.py',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 0035_maker_phase2', () => {
  it('declares the correct revision + down_revision', () => {
    expect(sql).toMatch(/revision: str = "0035_maker_phase2"/);
    expect(sql).toMatch(
      /down_revision: Union\[str, None\] = "0034_agos_audit_drop_project_fk"/,
    );
  });

  it('creates the 5 new tables idempotently', () => {
    for (const t of [
      'agos_maker_suppliers',
      'agos_maker_part_catalog',
      'agos_maker_part_supplier_links',
      'agos_maker_part_variants',
      'agos_maker_bom_lines',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`));
    }
  });

  it('creates the indexes idempotently (CREATE INDEX IF NOT EXISTS)', () => {
    for (const idx of [
      'agos_maker_suppliers_user_idx',
      'agos_maker_part_catalog_user_cat_idx',
      'agos_maker_part_catalog_tags_gin_idx',
      'agos_maker_part_supplier_links_part_idx',
      'agos_maker_part_supplier_links_supplier_idx',
      'agos_maker_part_variants_part_idx',
      'agos_maker_bom_lines_project_idx',
      'agos_maker_bom_lines_part_idx',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}`));
    }
  });

  it('tags column is TEXT[] backed by a GIN index', () => {
    expect(sql).toMatch(/tags\s+TEXT\[\]/);
    expect(sql).toMatch(/USING GIN \(tags\)/);
  });

  it('part_catalog category CHECK lists all 7 enum values', () => {
    expect(sql).toMatch(/agos_maker_part_catalog_category_chk/);
    for (const v of [
      'electronic',
      'mechanical',
      'fastener',
      'material',
      'tool',
      'consumable',
      'other',
    ]) {
      expect(sql).toMatch(new RegExp(`'${v}'`));
    }
  });

  it('bom_lines priority CHECK lists all 3 enum values', () => {
    expect(sql).toMatch(/agos_maker_bom_lines_priority_chk/);
    for (const p of ['low', 'normal', 'critical']) {
      expect(sql).toMatch(new RegExp(`'${p}'`));
    }
  });

  it('part_catalog.parent_part_catalog_id is a self-FK with ON DELETE SET NULL', () => {
    expect(sql).toMatch(
      /parent_part_catalog_id[\s\S]*?REFERENCES agos_maker_part_catalog\(id\)\s*\n\s*ON DELETE SET NULL/,
    );
  });

  it('part_supplier_links has CASCADE on both sides', () => {
    expect(sql).toMatch(/part_catalog_id[\s\S]*?REFERENCES agos_maker_part_catalog\(id\)\s*\n\s*ON DELETE CASCADE/);
    expect(sql).toMatch(/supplier_id[\s\S]*?REFERENCES agos_maker_suppliers\(id\)\s*\n\s*ON DELETE CASCADE/);
  });

  it('bom_lines.project_id CASCADEs from project deletion', () => {
    expect(sql).toMatch(
      /project_id[\s\S]*?REFERENCES agos_maker_projects\(id\)\s*\n\s*ON DELETE CASCADE/,
    );
  });

  it('bom_lines.variant_id is FK with ON DELETE SET NULL', () => {
    expect(sql).toMatch(
      /variant_id[\s\S]*?REFERENCES agos_maker_part_variants\(id\)\s*\n\s*ON DELETE SET NULL/,
    );
  });

  it('URL columns carry the MCP-storage-transfer comment', () => {
    for (const col of [
      'agos_maker_part_catalog.datasheet_url',
      'agos_maker_part_catalog.image_url',
      'agos_maker_part_supplier_links.url',
      'agos_maker_suppliers.homepage_url',
    ]) {
      expect(sql).toMatch(new RegExp(`COMMENT ON COLUMN ${col.replace(/\./g, '\\.')}`));
    }
    // The mcp-storage-transfer reference appears multiple times (one per URL column).
    expect(sql).toMatch(/docs\/architecture\/mcp-storage-transfer\.md/);
  });

  it('data migration is wrapped in a pg_tables existence check', () => {
    expect(sql).toMatch(/IF EXISTS \([\s\S]+?FROM pg_tables[\s\S]+?tablename = 'agos_maker_parts'/);
  });

  it('catalog backfill is DISTINCT by (user_id, name, category, unit)', () => {
    expect(sql).toMatch(/INSERT INTO agos_maker_part_catalog/);
    expect(sql).toMatch(/GROUP BY proj\.user_id, p\.name, p\.category, p\.unit/);
  });

  it('BOM-line backfill copies one row per legacy part', () => {
    expect(sql).toMatch(/INSERT INTO agos_maker_bom_lines/);
    expect(sql).toMatch(/FROM agos_maker_parts p\s+JOIN agos_maker_projects proj/);
    expect(sql).toMatch(/JOIN agos_maker_part_catalog c/);
  });

  it('DROPs the legacy agos_maker_parts table at the end of the migration', () => {
    expect(sql).toMatch(/DROP TABLE agos_maker_parts/);
  });

  it('downgrade re-creates the legacy table + drops the new ones in order', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS agos_maker_parts/);
    // bom_lines must drop before variants (FK ON DELETE SET NULL points there)
    const downStart = sql.indexOf('_DOWNGRADE_SQL');
    const dropBom = sql.indexOf('DROP TABLE IF EXISTS agos_maker_bom_lines', downStart);
    const dropVariants = sql.indexOf(
      'DROP TABLE IF EXISTS agos_maker_part_variants',
      downStart,
    );
    const dropLinks = sql.indexOf(
      'DROP TABLE IF EXISTS agos_maker_part_supplier_links',
      downStart,
    );
    const dropCatalog = sql.indexOf(
      'DROP TABLE IF EXISTS agos_maker_part_catalog',
      downStart,
    );
    const dropSuppliers = sql.indexOf(
      'DROP TABLE IF EXISTS agos_maker_suppliers',
      downStart,
    );
    expect(dropBom).toBeGreaterThan(0);
    expect(dropVariants).toBeGreaterThan(dropBom);
    expect(dropLinks).toBeGreaterThan(0);
    expect(dropCatalog).toBeGreaterThan(dropLinks);
    expect(dropSuppliers).toBeGreaterThan(dropCatalog);
  });
});
