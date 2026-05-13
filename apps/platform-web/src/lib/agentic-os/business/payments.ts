/**
 * Business OS Phase 4 — payment domain types + pure helpers.
 *
 * DB calls live in `payments-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

// ─── Constants ────────────────────────────────────────────────────────────

export const PAYMENT_METHODS = [
  'bank_transfer',
  'check',
  'cash',
  'card',
  'stripe',
  'paypal',
  'wire',
  'other',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// ─── Domain type ──────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  invoiceId: string;
  userId: string;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  receivedOn: string;
  reference: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ─── Create / update inputs ───────────────────────────────────────────────

export interface CreatePaymentInput {
  invoiceId: string;
  amountCents: number;
  currency?: string;
  method?: PaymentMethod;
  receivedOn?: string;
  reference?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export type UpdatePaymentInput = Partial<{
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  receivedOn: string;
  reference: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
}>;

// ─── List filter ──────────────────────────────────────────────────────────

export interface PaymentsListOpts {
  invoiceId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

// ─── Validators ───────────────────────────────────────────────────────────

export function isValidPaymentMethod(
  value: unknown,
): value is PaymentMethod {
  return (
    typeof value === 'string' &&
    (PAYMENT_METHODS as readonly string[]).includes(value)
  );
}
