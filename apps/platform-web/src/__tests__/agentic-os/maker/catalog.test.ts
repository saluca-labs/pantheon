/**
 * Maker OS — unit tests for catalog.ts (pure helpers).
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  PART_CATEGORIES,
  PART_CATEGORY_LABELS,
  PART_CATEGORY_VALUES,
  formatQuantity,
  normalizeTags,
  totalOnHand,
  validateOnHand,
  validatePartCategory,
  validateTags,
  type PartCatalogRow,
  type PartVariant,
} from '@/lib/agentic-os/maker/catalog';

// ─── Category taxonomy ─────────────────────────────────────────────────────

describe('PART_CATEGORY_VALUES', () => {
  it('contains exactly the 7 locked values matching the legacy enum', () => {
    expect(PART_CATEGORY_VALUES).toHaveLength(7);
    for (const v of [
      'electronic',
      'mechanical',
      'fastener',
      'material',
      'tool',
      'consumable',
      'other',
    ]) {
      expect(PART_CATEGORY_VALUES).toContain(v);
    }
  });
});

describe('PART_CATEGORIES + PART_CATEGORY_LABELS', () => {
  it('every value has a label and the array mirrors VALUES', () => {
    for (const v of PART_CATEGORY_VALUES) {
      expect(PART_CATEGORY_LABELS[v]).toBeTruthy();
    }
    expect(PART_CATEGORIES).toHaveLength(PART_CATEGORY_VALUES.length);
  });
});

describe('validatePartCategory', () => {
  it('returns null for every locked value', () => {
    for (const v of PART_CATEGORY_VALUES) {
      expect(validatePartCategory(v)).toBeNull();
    }
  });
  it('rejects unknown values', () => {
    expect(validatePartCategory('weapon')).toMatch(/Category must be/);
  });
  it('rejects non-strings', () => {
    expect(validatePartCategory(7 as never)).toMatch(/Category must be/);
    expect(validatePartCategory(null)).toMatch(/Category must be/);
  });
});

// ─── Validators ───────────────────────────────────────────────────────────

describe('validateOnHand', () => {
  it('accepts zero and positive finite numbers', () => {
    expect(validateOnHand(0)).toBeNull();
    expect(validateOnHand(1)).toBeNull();
    expect(validateOnHand(1.5)).toBeNull();
  });
  it('rejects negatives, NaN, and non-numbers', () => {
    expect(validateOnHand(-1)).toMatch(/non-negative/);
    expect(validateOnHand(Number.NaN)).toMatch(/non-negative/);
    expect(validateOnHand('1' as never)).toMatch(/non-negative/);
  });
});

describe('validateTags', () => {
  it('accepts a list of short non-empty strings', () => {
    expect(validateTags(['cnc', 'workshop'])).toBeNull();
    expect(validateTags([])).toBeNull();
  });
  it('rejects non-arrays', () => {
    expect(validateTags('cnc' as never)).toMatch(/array of strings/);
  });
  it('rejects empty strings', () => {
    expect(validateTags(['cnc', ''])).toMatch(/non-empty/);
  });
  it('rejects too many tags', () => {
    const many = Array.from({ length: 21 }, (_, i) => `tag-${i}`);
    expect(validateTags(many)).toMatch(/at most 20/);
  });
  it('rejects overlong tags', () => {
    expect(validateTags(['x'.repeat(61)])).toMatch(/too long/);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────

describe('normalizeTags', () => {
  it('lowercases, trims, dedupes, preserves order', () => {
    expect(normalizeTags(['  CNC ', 'workshop', 'cnc', 'WORKSHOP', ''])).toEqual([
      'cnc',
      'workshop',
    ]);
  });
  it('returns an empty array for an empty input', () => {
    expect(normalizeTags([])).toEqual([]);
  });
});

describe('totalOnHand', () => {
  const row: PartCatalogRow = {
    id: 'c-1',
    userId: 'u-1',
    name: 'M3 screw',
    category: 'fastener',
    manufacturer: null,
    mfgPartNumber: null,
    unit: 'pcs',
    parentPartCatalogId: null,
    quantityOnHand: 10,
    defaultSupplierId: null,
    datasheetUrl: null,
    imageUrl: null,
    tags: [],
    metadata: {},
    createdAt: '2026-05-11T00:00:00Z',
    updatedAt: '2026-05-11T00:00:00Z',
  };
  it('returns the row count when no variants', () => {
    expect(totalOnHand(row)).toBe(10);
    expect(totalOnHand(row, [])).toBe(10);
  });
  it('sums in variant on-hand counts', () => {
    const v: PartVariant[] = [
      {
        id: 'v-1',
        partCatalogId: 'c-1',
        variantLabel: 'M3x8',
        quantityOnHand: 5,
        metadata: {},
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'v-2',
        partCatalogId: 'c-1',
        variantLabel: 'M3x12',
        quantityOnHand: 2,
        metadata: {},
        createdAt: '',
        updatedAt: '',
      },
    ];
    expect(totalOnHand(row, v)).toBe(17);
  });
});

describe('formatQuantity', () => {
  it('returns integer strings for whole numbers', () => {
    expect(formatQuantity(0)).toBe('0');
    expect(formatQuantity(7)).toBe('7');
  });
  it('trims trailing zeros for fractions', () => {
    expect(formatQuantity(1.5)).toBe('1.5');
    expect(formatQuantity(1.123)).toBe('1.123');
  });
  it('returns em-dash for non-finite', () => {
    expect(formatQuantity(Number.NaN)).toBe('—');
    expect(formatQuantity(Infinity)).toBe('—');
  });
});
