/**
 * Maker OS — unit tests for suppliers.ts (pure helpers + validators).
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  cheapestLink,
  formatPrice,
  validateCurrency,
  validateLeadTimeDays,
  validateUnitPriceCents,
  type PartSupplierLink,
} from '@/lib/agentic-os/maker/suppliers';

// ─── Validators ───────────────────────────────────────────────────────────

describe('validateUnitPriceCents', () => {
  it('accepts null and undefined (no quote)', () => {
    expect(validateUnitPriceCents(null)).toBeNull();
    expect(validateUnitPriceCents(undefined)).toBeNull();
  });
  it('accepts zero and positive integers', () => {
    expect(validateUnitPriceCents(0)).toBeNull();
    expect(validateUnitPriceCents(199)).toBeNull();
  });
  it('rejects negatives, decimals, and overflows', () => {
    expect(validateUnitPriceCents(-1)).toMatch(/non-negative integer/);
    expect(validateUnitPriceCents(1.5)).toMatch(/non-negative integer/);
    expect(validateUnitPriceCents(2_000_000_000)).toMatch(/less than 1_000_000_000/);
  });
});

describe('validateLeadTimeDays', () => {
  it('accepts null/0/positive integers up to 10 years', () => {
    expect(validateLeadTimeDays(null)).toBeNull();
    expect(validateLeadTimeDays(0)).toBeNull();
    expect(validateLeadTimeDays(45)).toBeNull();
    expect(validateLeadTimeDays(3650)).toBeNull();
  });
  it('rejects > 3650 days', () => {
    expect(validateLeadTimeDays(3651)).toMatch(/at most 3650/);
  });
  it('rejects negatives and non-integers', () => {
    expect(validateLeadTimeDays(-1)).toMatch(/non-negative integer/);
    expect(validateLeadTimeDays(1.5)).toMatch(/non-negative integer/);
  });
});

describe('validateCurrency', () => {
  it('accepts 3-letter uppercase ISO codes', () => {
    expect(validateCurrency('USD')).toBeNull();
    expect(validateCurrency('EUR')).toBeNull();
  });
  it('rejects non-3-letter or non-uppercase', () => {
    expect(validateCurrency('usd')).toMatch(/3-letter/);
    expect(validateCurrency('US')).toMatch(/3-letter/);
    expect(validateCurrency('USDX')).toMatch(/3-letter/);
    expect(validateCurrency(123 as any)).toMatch(/3-letter/);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────

describe('formatPrice', () => {
  it('returns em-dash for null cents', () => {
    expect(formatPrice(null)).toBe('—');
  });
  it('formats integer cents to two-decimal dollars with currency', () => {
    expect(formatPrice(199)).toBe('1.99 USD');
    expect(formatPrice(199, 'EUR')).toBe('1.99 EUR');
    expect(formatPrice(0)).toBe('0.00 USD');
  });
});

function link(id: string, cents: number | null): PartSupplierLink {
  return {
    id,
    partCatalogId: 'c-1',
    supplierId: 's-1',
    supplierPartNumber: null,
    unitPriceCents: cents,
    currency: 'USD',
    leadTimeDays: null,
    url: null,
    lastPricedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

describe('cheapestLink', () => {
  it('picks the lowest priced link, ignoring null prices', () => {
    const links = [link('a', 500), link('b', null), link('c', 300), link('d', 400)];
    expect(cheapestLink(links)?.id).toBe('c');
  });
  it('returns null when no link carries a price', () => {
    expect(cheapestLink([link('a', null), link('b', null)])).toBeNull();
  });
  it('returns null for empty input', () => {
    expect(cheapestLink([])).toBeNull();
  });
});
