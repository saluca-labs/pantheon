/**
  * Business OS Phase 4 — invoice domain types + pure helpers.
 *
 * DB calls live in `invoices-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

// ─── Constants ────────────────────────────────────────────────────────────

export const INVOICE_STATUSES = [
  'draft',
  'sent',
  'partial',
  'paid',
  'overdue',
  'voided',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// ─── Domain type ──────────────────────────────────────────────────────────

export interface Invoice {
  id: string;
  userId: string;
  dealId: string | null;
  contactId: string | null;
  projectId: string | null;
  quoteId: string | null;
  invoiceNumber: string;
  title: string;
  descriptionMd: string;
  status: InvoiceStatus;
  invoiceDate: string;
  dueOn: string;
  terms: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  currency: string;
  pdfUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Create / update inputs ───────────────────────────────────────────────

export interface CreateInvoiceInput {
  title: string;
  invoiceNumber: string;
  contactId?: string | null;
  dealId?: string | null;
  projectId?: string | null;
  quoteId?: string | null;
  descriptionMd?: string;
  status?: InvoiceStatus;
  invoiceDate?: string;
  dueOn?: string;
  terms?: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Mutable fields.  subtotalCents / taxCents / totalCents / paidCents are
 * NOT in the update input — they are derived (subtotal/tax/total from line
 * items, paid from payments).  Call `updateInvoiceTotals` or
 * `reconcilePaidCents` to recompute them.
 */
export type UpdateInvoiceInput = Partial<{
  title: string;
  invoiceNumber: string;
  contactId: string | null;
  dealId: string | null;
  projectId: string | null;
  descriptionMd: string;
  invoiceDate: string;
  dueOn: string;
  terms: string;
  currency: string;
  metadata: Record<string, unknown>;
}>;

// ─── List filter ──────────────────────────────────────────────────────────

export interface InvoicesListOpts {
  status?: InvoiceStatus | InvoiceStatus[];
  contactId?: string;
  projectId?: string;
  dealId?: string;
  from?: string;
  to?: string;
  outstanding?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

// ─── Validators ───────────────────────────────────────────────────────────

export function isValidInvoiceStatus(
  value: unknown,
): value is InvoiceStatus {
  return (
    typeof value === 'string' &&
    (INVOICE_STATUSES as readonly string[]).includes(value)
  );
}

export function validateInvoiceTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 300) return 'too long (max 300 chars)';
  return null;
}

export function validateInvoiceNumber(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 50) return 'too long (max 50 chars)';
  return null;
}
