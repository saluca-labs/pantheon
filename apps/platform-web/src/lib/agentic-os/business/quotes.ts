/**
 * Business OS Phase 4 — quote domain types + pure helpers.
 *
 * DB calls live in `quotes-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

// ─── Constants ────────────────────────────────────────────────────────────

export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'converted',
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

// ─── Domain type ──────────────────────────────────────────────────────────

export interface Quote {
  id: string;
  userId: string;
  dealId: string | null;
  contactId: string | null;
  projectId: string | null;
  quoteNumber: string;
  title: string;
  descriptionMd: string;
  status: QuoteStatus;
  quoteDate: string;
  expiresOn: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  convertedInvoiceId: string | null;
  metadata: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Create / update inputs ───────────────────────────────────────────────

export interface CreateQuoteInput {
  title: string;
  quoteNumber: string;
  contactId?: string | null;
  dealId?: string | null;
  projectId?: string | null;
  descriptionMd?: string;
  status?: QuoteStatus;
  quoteDate?: string;
  expiresOn?: string | null;
  currency?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Mutable fields.  subtotalCents / taxCents / totalCents are NOT in the
 * update input because they are derived from line items — call
 * `updateQuoteTotals` after mutating line items instead.
 */
export type UpdateQuoteInput = Partial<{
  title: string;
  quoteNumber: string;
  contactId: string | null;
  dealId: string | null;
  projectId: string | null;
  descriptionMd: string;
  status: QuoteStatus;
  quoteDate: string;
  expiresOn: string | null;
  currency: string;
  metadata: Record<string, unknown>;
}>;

// ─── List filter ──────────────────────────────────────────────────────────

export interface QuotesListOpts {
  archived?: boolean;
  status?: QuoteStatus | QuoteStatus[];
  contactId?: string;
  dealId?: string;
  projectId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

// ─── Validators ───────────────────────────────────────────────────────────

export function isValidQuoteStatus(value: unknown): value is QuoteStatus {
  return (
    typeof value === 'string' &&
    (QUOTE_STATUSES as readonly string[]).includes(value)
  );
}

export function validateQuoteTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 300) return 'too long (max 300 chars)';
  return null;
}

export function validateQuoteNumber(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 50) return 'too long (max 50 chars)';
  return null;
}
