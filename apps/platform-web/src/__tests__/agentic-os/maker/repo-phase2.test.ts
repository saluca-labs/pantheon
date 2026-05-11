/**
 * Maker OS — Phase 2 repo CRUD tests.
 *
 * Mocks the pg Pool and asserts:
 *   - listCatalog: table + filter clauses (category, search, tag).
 *   - createCatalogRow: INSERT params, default category, tag normalization.
 *   - updateCatalogRow: COALESCE-style nullable patch.
 *   - deleteCatalogRow: row count -> boolean.
 *   - Suppliers: list/get/create/update/delete shape.
 *   - Supplier links: createSupplierLink verifies both catalog + supplier
 *     ownership, listSupplierLinks orders by unit_price ASC NULLS LAST.
 *   - Variants: listVariants verifies catalog ownership first.
 *   - BOM lines: createBomLine verifies project + catalog ownership.
 *
 * Pattern mirrors `repo.test.ts` — sequential mocked queue, every call
 * captured in `calls[]`.
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// The create* helpers in repo.ts use `id = randomUUID()` then re-read via a
// listSupplierLinks / listVariants / listBomLines call and `find(r => r.id ===
// id)` to return the freshly-inserted row. Tests can't predict the UUID, so
// the queue runner below auto-pulls the inserted id from the INSERT params and
// rewrites the next SELECT row's id so the .find() lands.

interface PgResult {
  rows: any[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: any[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

let lastInsertedId: string | null = null;

vi.mock('@/lib/agentic-os/maker/session', () => ({
  getMakerPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      // Snapshot the id positional param for INSERT calls so we can rewrite
      // the SELECT row that follows. The repo convention is `id` at $1.
      if (/^INSERT INTO /m.test(sql) && typeof params[0] === 'string') {
        lastInsertedId = params[0];
      }
      const next = queue.shift() ?? { rows: [], rowCount: 0 };
      // For SELECT queries that include "id =" or list-type queries used by
      // the create* helpers, rewrite the first row's `id` to the last
      // inserted id so the helpers' `.find(r => r.id === id)` matches.
      if (lastInsertedId && next.rows[0] && /^SELECT /m.test(sql)) {
        next.rows[0] = { ...next.rows[0], id: lastInsertedId };
      }
      return next;
    }),
  }),
}));

import {
  listCatalog,
  createCatalogRow,
  updateCatalogRow,
  deleteCatalogRow,
  getCatalogRow,
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  listSupplierLinks,
  createSupplierLink,
  listVariants,
  createVariant,
  listBomLines,
  createBomLine,
  deleteBomLine,
} from '@/lib/agentic-os/maker/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  lastInsertedId = null;
});

function catalogRow(over: Record<string, any> = {}): any {
  return {
    id: 'c-1',
    user_id: 'u-1',
    name: 'M3 screw',
    category: 'fastener',
    manufacturer: 'Generic',
    mfg_part_number: 'M3-001',
    unit: 'pcs',
    parent_part_catalog_id: null,
    quantity_on_hand: 10,
    default_supplier_id: null,
    datasheet_url: null,
    image_url: null,
    tags: ['hardware'],
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T01:00:00Z'),
    ...over,
  };
}

function supplierRow(over: Record<string, any> = {}): any {
  return {
    id: 's-1',
    user_id: 'u-1',
    name: 'McMaster',
    homepage_url: null,
    notes: null,
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

function projectRow(over: Record<string, any> = {}): any {
  return {
    id: 'p-1',
    user_id: 'u-1',
    name: 'CNC v2',
    description: null,
    status: 'concept',
    tags: [],
    cover_image_url: null,
    target_completion_date: null,
    team_size: null,
    phase_progress: {},
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

// ─── Catalog ──────────────────────────────────────────────────────────────

describe('listCatalog', () => {
  it('queries agos_maker_part_catalog by user_id', async () => {
    pushResult({ rows: [catalogRow()] });
    const rows = await listCatalog({ userId: 'u-1' });
    expect(rows).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/FROM agos_maker_part_catalog/);
    expect(calls[0]!.sql).toMatch(/WHERE user_id = \$1/);
  });

  it('applies category filter when provided', async () => {
    pushResult({ rows: [] });
    await listCatalog({ userId: 'u-1', category: 'fastener' });
    expect(calls[0]!.sql).toMatch(/category = \$2/);
    expect(calls[0]!.params).toContain('fastener');
  });

  it('applies search filter (LOWER LIKE on name/manufacturer/MPN)', async () => {
    pushResult({ rows: [] });
    await listCatalog({ userId: 'u-1', search: 'screw' });
    expect(calls[0]!.sql).toMatch(/LOWER\(name\) LIKE/);
    expect(calls[0]!.sql).toMatch(/LOWER\(COALESCE\(manufacturer/);
  });

  it('applies tag filter via ANY(tags)', async () => {
    pushResult({ rows: [] });
    await listCatalog({ userId: 'u-1', tag: 'cnc' });
    expect(calls[0]!.sql).toMatch(/ANY\(tags\)/);
    expect(calls[0]!.params).toContain('cnc');
  });

  it('throws on an unknown category', async () => {
    await expect(
      listCatalog({ userId: 'u-1', category: 'weapon' as any }),
    ).rejects.toThrow(/Invalid category/);
  });
});

describe('createCatalogRow', () => {
  it('INSERTs with default category "other" + normalized tags', async () => {
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    pushResult({ rows: [catalogRow({ category: 'other', tags: ['cnc'] })] }); // SELECT

    const row = await createCatalogRow('u-1', {
      name: 'X',
      tags: ['  CNC ', 'cnc', ''],
    });

    const insert = calls[0]!;
    expect(insert.sql).toMatch(/INSERT INTO agos_maker_part_catalog/);
    // $4 is the category param
    expect(insert.params[3]).toBe('other');
    // tags param should be the normalized array, not a JSON string
    const tagsParam = insert.params.find(
      (p) => Array.isArray(p) && p.includes('cnc'),
    );
    expect(tagsParam).toEqual(['cnc']);
    expect(row.category).toBe('other');
  });

  it('rejects an unknown category', async () => {
    await expect(
      createCatalogRow('u-1', { name: 'X', category: 'weapon' as any }),
    ).rejects.toThrow(/Invalid category/);
  });
});

describe('updateCatalogRow', () => {
  it('uses COALESCE-style nullable patch params', async () => {
    pushResult({ rowCount: 1, rows: [] }); // UPDATE
    pushResult({ rows: [catalogRow({ name: 'Renamed' })] }); // SELECT
    await updateCatalogRow('c-1', 'u-1', { name: 'Renamed' });
    expect(calls[0]!.sql).toMatch(/UPDATE agos_maker_part_catalog/);
    expect(calls[0]!.params[2]).toBe('Renamed'); // $3 name
    expect(calls[0]!.params[3]).toBeNull(); // $4 category
  });
});

describe('deleteCatalogRow', () => {
  it('returns true when a row was removed', async () => {
    pushResult({ rowCount: 1, rows: [] });
    expect(await deleteCatalogRow('c-1', 'u-1')).toBe(true);
    expect(calls[0]!.sql).toMatch(/DELETE FROM agos_maker_part_catalog/);
  });
  it('returns false when no row matched', async () => {
    pushResult({ rowCount: 0, rows: [] });
    expect(await deleteCatalogRow('c-9', 'u-1')).toBe(false);
  });
});

describe('getCatalogRow', () => {
  it('returns null when no row matches', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getCatalogRow('c-1', 'u-1')).toBeNull();
  });
  it('returns a hydrated row when found', async () => {
    pushResult({ rows: [catalogRow({ tags: ['hardware', 'workshop'] })] });
    const row = await getCatalogRow('c-1', 'u-1');
    expect(row?.tags).toEqual(['hardware', 'workshop']);
  });
});

// ─── Suppliers ────────────────────────────────────────────────────────────

describe('listSuppliers', () => {
  it('queries agos_maker_suppliers ordered by name', async () => {
    pushResult({ rows: [supplierRow()] });
    const r = await listSuppliers('u-1');
    expect(r).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/FROM agos_maker_suppliers/);
    expect(calls[0]!.sql).toMatch(/ORDER BY name/);
  });
});

describe('createSupplier', () => {
  it('INSERTs then re-reads via SELECT', async () => {
    pushResult({ rowCount: 1, rows: [] });
    pushResult({ rows: [supplierRow({ name: 'AliBaba' })] });
    const s = await createSupplier('u-1', { name: 'AliBaba' });
    expect(s.name).toBe('AliBaba');
    expect(calls[0]!.sql).toMatch(/INSERT INTO agos_maker_suppliers/);
  });
});

describe('updateSupplier + deleteSupplier', () => {
  it('updateSupplier COALESCEs the patch', async () => {
    pushResult({ rowCount: 1, rows: [] });
    pushResult({ rows: [supplierRow()] });
    await updateSupplier('s-1', 'u-1', { homepageUrl: 'https://x' });
    expect(calls[0]!.sql).toMatch(/UPDATE agos_maker_suppliers/);
    expect(calls[0]!.params[3]).toBe('https://x');
  });
  it('deleteSupplier returns true/false on rowCount', async () => {
    pushResult({ rowCount: 1, rows: [] });
    expect(await deleteSupplier('s-1', 'u-1')).toBe(true);
    pushResult({ rowCount: 0, rows: [] });
    expect(await deleteSupplier('s-9', 'u-1')).toBe(false);
  });
});

// ─── Supplier links ───────────────────────────────────────────────────────

describe('listSupplierLinks', () => {
  it('asserts catalog ownership then orders by unit_price ASC NULLS LAST', async () => {
    // assertCatalogOwnership -> getCatalogRow query first
    pushResult({ rows: [catalogRow()] });
    // SELECT links
    pushResult({ rows: [] });
    await listSupplierLinks('c-1', 'u-1');
    expect(calls).toHaveLength(2);
    expect(calls[0]!.sql).toMatch(/FROM agos_maker_part_catalog/);
    expect(calls[1]!.sql).toMatch(/FROM agos_maker_part_supplier_links/);
    expect(calls[1]!.sql).toMatch(/ORDER BY unit_price_cents ASC NULLS LAST/);
  });

  it('throws when the catalog row is not owned by the user', async () => {
    pushResult({ rows: [], rowCount: 0 });
    await expect(listSupplierLinks('c-1', 'u-1')).rejects.toThrow(/not owned/);
  });
});

describe('createSupplierLink', () => {
  it('verifies both catalog and supplier ownership before insert', async () => {
    // assertCatalogOwnership -> getCatalogRow
    pushResult({ rows: [catalogRow()] });
    // getSupplier
    pushResult({ rows: [supplierRow()] });
    // INSERT
    pushResult({ rowCount: 1, rows: [] });
    // assertCatalogOwnership again (inside listSupplierLinks re-read)
    pushResult({ rows: [catalogRow()] });
    // SELECT links
    pushResult({
      rows: [
        {
          id: 'stub-uuid',
          part_catalog_id: 'c-1',
          supplier_id: 's-1',
          supplier_part_number: null,
          unit_price_cents: 100,
          currency: 'USD',
          lead_time_days: null,
          url: null,
          last_priced_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });

    const link = await createSupplierLink('c-1', 'u-1', {
      supplierId: 's-1',
      unitPriceCents: 100,
    });
    expect(link.unitPriceCents).toBe(100);
  });

  it('rejects when supplier does not belong to user', async () => {
    pushResult({ rows: [catalogRow()] });
    pushResult({ rows: [], rowCount: 0 });
    await expect(
      createSupplierLink('c-1', 'u-1', { supplierId: 's-x', unitPriceCents: 100 }),
    ).rejects.toThrow(/Supplier not found/);
  });
});

// ─── Variants ─────────────────────────────────────────────────────────────

describe('listVariants + createVariant', () => {
  it('listVariants asserts catalog ownership first', async () => {
    pushResult({ rows: [catalogRow()] });
    pushResult({ rows: [] });
    await listVariants('c-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/FROM agos_maker_part_catalog/);
    expect(calls[1]!.sql).toMatch(/FROM agos_maker_part_variants/);
  });

  it('createVariant INSERTs then re-reads', async () => {
    // catalog ownership check
    pushResult({ rows: [catalogRow()] });
    // INSERT
    pushResult({ rowCount: 1, rows: [] });
    // listVariants ownership re-check
    pushResult({ rows: [catalogRow()] });
    // SELECT variants
    pushResult({
      rows: [
        {
          id: 'stub-uuid',
          part_catalog_id: 'c-1',
          variant_label: 'M3x8',
          quantity_on_hand: 5,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });

    const v = await createVariant('c-1', 'u-1', {
      variantLabel: 'M3x8',
      quantityOnHand: 5,
    });
    expect(v.variantLabel).toBe('M3x8');
    expect(v.quantityOnHand).toBe(5);
  });
});

// ─── BOM lines ────────────────────────────────────────────────────────────

describe('listBomLines + createBomLine + deleteBomLine', () => {
  it('listBomLines asserts project ownership first', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [] });
    await listBomLines('p-1', 'u-1');
    expect(calls[0]!.sql).toMatch(/FROM agos_maker_projects/);
    expect(calls[1]!.sql).toMatch(/FROM agos_maker_bom_lines/);
  });

  it('createBomLine verifies project AND catalog ownership', async () => {
    // project ownership
    pushResult({ rows: [projectRow()] });
    // catalog ownership
    pushResult({ rows: [catalogRow()] });
    // INSERT
    pushResult({ rowCount: 1, rows: [] });
    // listBomLines: project ownership again
    pushResult({ rows: [projectRow()] });
    // SELECT lines
    pushResult({
      rows: [
        {
          id: 'stub-uuid',
          project_id: 'p-1',
          part_catalog_id: 'c-1',
          variant_id: null,
          quantity_needed: 5,
          notes: null,
          priority: 'normal',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });

    const line = await createBomLine('p-1', 'u-1', {
      partCatalogId: 'c-1',
      quantityNeeded: 5,
    });
    expect(line.quantityNeeded).toBe(5);
    expect(line.priority).toBe('normal');
  });

  it('createBomLine rejects an unknown priority', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [catalogRow()] });
    await expect(
      createBomLine('p-1', 'u-1', {
        partCatalogId: 'c-1',
        quantityNeeded: 5,
        priority: 'urgent' as any,
      }),
    ).rejects.toThrow(/Invalid priority/);
  });

  it('deleteBomLine returns rowCount > 0', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rowCount: 1, rows: [] });
    expect(await deleteBomLine('l-1', 'p-1', 'u-1')).toBe(true);
  });
});
