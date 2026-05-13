/**
 * Business OS Phase 4 — shared line-item domain types + pure helpers.
 *
 * Line items use an XOR pattern: exactly ONE of `quoteId` / `invoiceId`
 * must be non-null.  The DB enforces this with a CHECK constraint; the
 * TypeScript type carries both fields as nullable but route validators
 * reject rows that violate the XOR invariant.
 *
 * DB calls live in `line-items-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

// ─── Domain type ──────────────────────────────────────────────────────────

export interface LineItem {
  id: string;
  quoteId: string | null;
  invoiceId: string | null;
  userId: string;
  position: number;
  description: string;
  quantity: number;
  unitLabel: string;
  unitPriceCents: number;
  lineTotalCents: number;
  taxRateBp: number;
  lineTaxCents: number;
  timeEntryIds: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ─── Create / update inputs ───────────────────────────────────────────────

export type LineItemParentType = 'quote' | 'invoice';

export interface CreateLineItemInput {
  quoteId?: string | null;
  invoiceId?: string | null;
  description?: string;
  quantity?: number;
  unitLabel?: string;
  unitPriceCents?: number;
  taxRateBp?: number;
  position?: number;
  timeEntryIds?: string[];
  metadata?: Record<string, unknown>;
}

export type UpdateLineItemInput = Partial<{
  description: string;
  quantity: number;
  unitLabel: string;
  unitPriceCents: number;
  taxRateBp: number;
  position: number;
  metadata: Record<string, unknown>;
}>;

// ─── Pure helpers ─────────────────────────────────────────────────────────

/**
 * Line total before tax in minor currency units.
 * Rounds to nearest whole cent (standard round-half-up via Math.round).
 */
export function computeLineTotal(
  quantity: number,
  unitPriceCents: number,
): number {
  return Math.round(quantity * unitPriceCents);
}

/**
 * Tax amount derived from line total and tax rate in basis points.
 * 1 bp = 0.01 %, so 10000 bp = 100 %.
 */
export function computeTax(lineTotalCents: number, taxRateBp: number): number {
  return Math.round((lineTotalCents * taxRateBp) / 10000);
}
