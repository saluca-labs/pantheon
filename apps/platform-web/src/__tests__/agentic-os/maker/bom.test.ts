/**
 * Maker OS — unit tests for bom.ts (priority + pure summary computation).
 *
 * The summary calculator owns the project's deficit / free / est_cost math.
 * Tests cover:
 *   - per-line free = on_hand − other_active_demand (clamped at 0)
 *   - per-line deficit = max(0, needed − free)
 *   - est_cost picks the lowest unit_price_cents among supplier links
 *   - totals aggregate cleanly (cost + deficit + critical-short count)
 *   - variant on-hand wins over catalog on-hand when a variant is set
 *   - missing catalog rows are silently skipped (defensive)
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  ACTIVE_PROJECT_STATUSES,
  BOM_PRIORITY_LABELS,
  BOM_PRIORITY_VALUES,
  computeBomSummary,
  isActiveStatus,
  validateBomPriority,
  validateQuantityNeeded,
  type BomLine,
} from '@/lib/agentic-os/maker/bom';
import type { PartCatalogRow, PartVariant } from '@/lib/agentic-os/maker/catalog';
import type { PartSupplierLink } from '@/lib/agentic-os/maker/suppliers';

// ─── Active statuses ───────────────────────────────────────────────────────

describe('ACTIVE_PROJECT_STATUSES + isActiveStatus', () => {
  it('excludes done and archived', () => {
    expect((ACTIVE_PROJECT_STATUSES as readonly string[]).includes('done')).toBe(false);
    expect((ACTIVE_PROJECT_STATUSES as readonly string[]).includes('archived')).toBe(false);
  });
  it('includes the 6 working phases', () => {
    for (const s of [
      'concept',
      'design',
      'procurement',
      'fabrication',
      'assembly',
      'commissioning',
    ]) {
      expect(isActiveStatus(s as never)).toBe(true);
    }
  });
  it('done and archived are not active', () => {
    expect(isActiveStatus('done')).toBe(false);
    expect(isActiveStatus('archived')).toBe(false);
  });
});

// ─── Priority ─────────────────────────────────────────────────────────────

describe('BOM_PRIORITY_VALUES + BOM_PRIORITY_LABELS', () => {
  it('contains the 3 locked values with labels', () => {
    expect(BOM_PRIORITY_VALUES).toEqual(['low', 'normal', 'critical']);
    for (const p of BOM_PRIORITY_VALUES) {
      expect(BOM_PRIORITY_LABELS[p]).toBeTruthy();
    }
  });
});

describe('validateBomPriority', () => {
  it('accepts each locked value', () => {
    expect(validateBomPriority('low')).toBeNull();
    expect(validateBomPriority('normal')).toBeNull();
    expect(validateBomPriority('critical')).toBeNull();
  });
  it('rejects unknown values', () => {
    expect(validateBomPriority('urgent')).toMatch(/priority must be/);
  });
});

describe('validateQuantityNeeded', () => {
  it('accepts positive numbers (integer and fractional)', () => {
    expect(validateQuantityNeeded(1)).toBeNull();
    expect(validateQuantityNeeded(1.5)).toBeNull();
  });
  it('rejects zero, negative, and non-finite', () => {
    expect(validateQuantityNeeded(0)).toMatch(/positive/);
    expect(validateQuantityNeeded(-1)).toMatch(/positive/);
    expect(validateQuantityNeeded(Number.NaN)).toMatch(/positive/);
    expect(validateQuantityNeeded('1' as never)).toMatch(/positive/);
  });
});

// ─── Pure summary ──────────────────────────────────────────────────────────

function catRow(id: string, qty: number): PartCatalogRow {
  return {
    id,
    userId: 'u-1',
    name: `Part ${id}`,
    category: 'other',
    manufacturer: null,
    mfgPartNumber: null,
    unit: 'pcs',
    parentPartCatalogId: null,
    quantityOnHand: qty,
    defaultSupplierId: null,
    datasheetUrl: null,
    imageUrl: null,
    tags: [],
    metadata: {},
    createdAt: '',
    updatedAt: '',
  };
}

function variant(id: string, partId: string, qty: number): PartVariant {
  return {
    id,
    partCatalogId: partId,
    variantLabel: `v-${id}`,
    quantityOnHand: qty,
    metadata: {},
    createdAt: '',
    updatedAt: '',
  };
}

function bomLine(
  id: string,
  partId: string,
  needed: number,
  variantId: string | null = null,
  priority: 'low' | 'normal' | 'critical' = 'normal',
): BomLine {
  return {
    id,
    projectId: 'p-1',
    partCatalogId: partId,
    variantId,
    quantityNeeded: needed,
    notes: null,
    priority,
    createdAt: '',
    updatedAt: '',
  };
}

function priceLink(
  id: string,
  partId: string,
  cents: number | null,
  currency = 'USD',
): PartSupplierLink {
  return {
    id,
    partCatalogId: partId,
    supplierId: 's-1',
    supplierPartNumber: null,
    unitPriceCents: cents,
    currency,
    leadTimeDays: null,
    url: null,
    lastPricedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

describe('computeBomSummary', () => {
  it('computes free = on_hand − other_demand and deficit correctly', () => {
    const cat = catRow('c-1', 10);
    const line = bomLine('l-1', 'c-1', 5); // need 5
    const summary = computeBomSummary({
      projectId: 'p-1',
      projectLines: [line],
      otherDemand: new Map([['c-1:NULL', 4]]), // other active projects consume 4
      catalogById: new Map([['c-1', cat]]),
      variantById: new Map(),
      linksByCatalog: new Map(),
    });

    expect(summary.rows).toHaveLength(1);
    const row = summary.rows[0]!;
    expect(row.onHand).toBe(10);
    expect(row.free).toBe(6); // 10 - 4
    expect(row.deficit).toBe(0); // need 5, free 6
    expect(row.estCostCents).toBeNull(); // no supplier link
  });

  it('clamps free at zero when other demand exceeds on-hand', () => {
    const cat = catRow('c-1', 3);
    const line = bomLine('l-1', 'c-1', 5);
    const summary = computeBomSummary({
      projectId: 'p-1',
      projectLines: [line],
      otherDemand: new Map([['c-1:NULL', 10]]),
      catalogById: new Map([['c-1', cat]]),
      variantById: new Map(),
      linksByCatalog: new Map(),
    });
    const row = summary.rows[0]!;
    expect(row.free).toBe(0); // not -7
    expect(row.deficit).toBe(5); // need all 5
  });

  it('uses variant on-hand when a variant id is set', () => {
    const cat = catRow('c-1', 100); // parent has 100
    const v = variant('v-1', 'c-1', 2); // variant has only 2
    const line = bomLine('l-1', 'c-1', 5, 'v-1');
    const summary = computeBomSummary({
      projectId: 'p-1',
      projectLines: [line],
      otherDemand: new Map(),
      catalogById: new Map([['c-1', cat]]),
      variantById: new Map([['v-1', v]]),
      linksByCatalog: new Map(),
    });
    const row = summary.rows[0]!;
    expect(row.onHand).toBe(2); // variant wins
    expect(row.deficit).toBe(3); // 5 - 2
  });

  it('picks the cheapest priced link for est_cost', () => {
    const cat = catRow('c-1', 0);
    const line = bomLine('l-1', 'c-1', 10);
    const summary = computeBomSummary({
      projectId: 'p-1',
      projectLines: [line],
      otherDemand: new Map(),
      catalogById: new Map([['c-1', cat]]),
      variantById: new Map(),
      linksByCatalog: new Map([
        [
          'c-1',
          [
            priceLink('a', 'c-1', 500),
            priceLink('b', 'c-1', 300),
            priceLink('c', 'c-1', null),
            priceLink('d', 'c-1', 400),
          ],
        ],
      ]),
    });
    const row = summary.rows[0]!;
    expect(row.cheapestLinkId).toBe('b');
    expect(row.estCostCents).toBe(3000); // 300 × 10
    expect(summary.totalEstCostCents).toBe(3000);
  });

  it('aggregates totals across multiple lines', () => {
    const summary = computeBomSummary({
      projectId: 'p-1',
      projectLines: [
        bomLine('l-1', 'c-1', 5, null, 'normal'),
        bomLine('l-2', 'c-2', 2, null, 'critical'),
      ],
      otherDemand: new Map(),
      catalogById: new Map([
        ['c-1', catRow('c-1', 5)],
        ['c-2', catRow('c-2', 0)], // entirely missing -> critical short
      ]),
      variantById: new Map(),
      linksByCatalog: new Map([
        ['c-1', [priceLink('a', 'c-1', 100)]], // 5 × $1.00 = $5
        ['c-2', [priceLink('b', 'c-2', 200)]], // 2 × $2.00 = $4
      ]),
    });
    expect(summary.linesCount).toBe(2);
    expect(summary.totalEstCostCents).toBe(500 + 400);
    expect(summary.totalDeficit).toBe(0 + 2);
    expect(summary.criticalDeficitLines).toBe(1);
  });

  it('silently skips lines whose catalog row is missing (defensive)', () => {
    const summary = computeBomSummary({
      projectId: 'p-1',
      projectLines: [bomLine('l-1', 'c-MISSING', 5)],
      otherDemand: new Map(),
      catalogById: new Map(),
      variantById: new Map(),
      linksByCatalog: new Map(),
    });
    expect(summary.rows).toHaveLength(0);
    expect(summary.linesCount).toBe(0);
  });

  it('returns zero totals for an empty BOM', () => {
    const summary = computeBomSummary({
      projectId: 'p-1',
      projectLines: [],
      otherDemand: new Map(),
      catalogById: new Map(),
      variantById: new Map(),
      linksByCatalog: new Map(),
    });
    expect(summary.linesCount).toBe(0);
    expect(summary.totalEstCostCents).toBe(0);
    expect(summary.totalDeficit).toBe(0);
    expect(summary.criticalDeficitLines).toBe(0);
  });
});
