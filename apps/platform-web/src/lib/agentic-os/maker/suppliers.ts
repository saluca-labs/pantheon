/**
 * Maker OS — Supplier domain types and pure helpers.
 *
 * Suppliers are user-scoped directory entries; the N:M link to a catalog row
 * lives in `agos_maker_part_supplier_links` with price + lead-time fields.
 *
 * No database calls here — those live in `repo.ts`.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

// ─── Supplier ─────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  userId: string;
  name: string;
  homepageUrl: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierUpsert {
  name: string;
  homepageUrl?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

// ─── Supplier link ────────────────────────────────────────────────────────

export interface PartSupplierLink {
  id: string;
  partCatalogId: string;
  supplierId: string;
  supplierPartNumber: string | null;
  unitPriceCents: number | null;
  currency: string;
  leadTimeDays: number | null;
  url: string | null;
  lastPricedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartSupplierLinkUpsert {
  supplierId: string;
  supplierPartNumber?: string | null;
  unitPriceCents?: number | null;
  currency?: string;
  leadTimeDays?: number | null;
  url?: string | null;
  lastPricedAt?: string | null;
}

// ─── Validators ───────────────────────────────────────────────────────────

/**
 * Validate a unit-price-cents value — must be a non-negative integer when
 * provided. Returns an error string or null when valid.
 */
export function validateUnitPriceCents(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return 'unit_price_cents must be a non-negative integer (or null).';
  }
  if (value > 1_000_000_000) {
    return 'unit_price_cents must be less than 1_000_000_000 ($10M cap).';
  }
  return null;
}

/** Validate a lead-time-days value — non-negative integer when provided. */
export function validateLeadTimeDays(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return 'lead_time_days must be a non-negative integer (or null).';
  }
  if (value > 3650) {
    return 'lead_time_days must be at most 3650 (10 years).';
  }
  return null;
}

/** Currency code: 3-letter uppercase. */
export function validateCurrency(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    return 'currency must be a 3-letter ISO code (e.g. USD).';
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Format a cents price for display. Returns `—` for null. Always shows two
 * decimal places and the currency code.
 */
export function formatPrice(cents: number | null, currency: string = 'USD'): string {
  if (cents == null) return '—';
  const dollars = cents / 100;
  return `${dollars.toFixed(2)} ${currency}`;
}

/**
 * Pick the lowest-priced link from a list (treating nulls as "no quote").
 * Returns null when no link carries a price.
 */
export function cheapestLink(links: PartSupplierLink[]): PartSupplierLink | null {
  let best: PartSupplierLink | null = null;
  for (const link of links) {
    if (link.unitPriceCents == null) continue;
    if (!best || link.unitPriceCents < (best.unitPriceCents ?? Infinity)) {
      best = link;
    }
  }
  return best;
}
