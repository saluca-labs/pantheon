/**
 * Maker OS — pure-logic unit tests for inventory.ts helpers.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  summariseInventory,
  validateQuantity,
  buildSlug,
} from '@/lib/agentic-os/maker/inventory';
import type { PartItem } from '@/lib/agentic-os/maker/inventory';

function fakePart(overrides: Partial<PartItem> = {}): PartItem {
  return {
    id: 'uuid-1',
    buildId: 'build-1',
    name: 'NEMA 17 Stepper',
    category: 'electronic',
    quantity: 1,
    unit: 'pcs',
    notes: null,
    sourceUrl: null,
    inStock: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('summariseInventory', () => {
  it('returns zeros for empty parts list', () => {
    const s = summariseInventory([]);
    expect(s.total).toBe(0);
    expect(s.inStock).toBe(0);
    expect(s.missing).toBe(0);
    expect(s.pctReady).toBe(0);
  });

  it('counts in-stock parts correctly', () => {
    const parts = [fakePart({ inStock: true }), fakePart({ inStock: false }), fakePart({ inStock: true })];
    const s = summariseInventory(parts);
    expect(s.total).toBe(3);
    expect(s.inStock).toBe(2);
    expect(s.missing).toBe(1);
    expect(s.pctReady).toBe(67);
  });

  it('returns 100% when all parts are in stock', () => {
    const parts = [fakePart({ inStock: true }), fakePart({ inStock: true })];
    const s = summariseInventory(parts);
    expect(s.pctReady).toBe(100);
  });

  it('returns 0% when no parts are in stock', () => {
    const parts = [fakePart({ inStock: false }), fakePart({ inStock: false })];
    const s = summariseInventory(parts);
    expect(s.pctReady).toBe(0);
  });
});

describe('validateQuantity', () => {
  it('accepts positive integers', () => {
    expect(validateQuantity(1)).toBeNull();
    expect(validateQuantity(100)).toBeNull();
  });

  it('rejects zero', () => {
    expect(validateQuantity(0)).toBeTruthy();
  });

  it('rejects negative numbers', () => {
    expect(validateQuantity(-1)).toBeTruthy();
  });

  it('rejects non-integers', () => {
    expect(validateQuantity(1.5)).toBeTruthy();
  });

  it('rejects non-numbers', () => {
    expect(validateQuantity('5')).toBeTruthy();
    expect(validateQuantity(null)).toBeTruthy();
  });
});

describe('buildSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(buildSlug('CNC Router v2')).toBe('cnc-router-v2');
  });

  it('collapses multiple non-alphanumeric chars', () => {
    expect(buildSlug('My  Build -- 2024')).toBe('my-build-2024');
  });

  it('strips leading/trailing hyphens', () => {
    expect(buildSlug(' test ')).toBe('test');
  });

  it('handles all-lowercase names unchanged', () => {
    expect(buildSlug('laser-cutter')).toBe('laser-cutter');
  });
});
