/**
 * Business OS Phase 4 — payments DB repository.
 *
 * Every payment mutation calls `reconcilePaidCents` on the parent invoice
 * so `paid_cents` and status (auto-transition to `paid`) stay in sync.
 *
 * Cross-ownership contract: validates invoice ownership on every operation.
 * A payment id linked to an invoice belonging to another user returns null.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import { reconcilePaidCents } from './invoices-repo';
import {
  PAYMENT_METHODS,
  type Payment,
  type PaymentMethod,
  type CreatePaymentInput,
  type UpdatePaymentInput,
  type PaymentsListOpts,
} from './payments';

const PAYMENT_COLUMNS = `id, invoice_id, user_id, amount_cents, currency,
                           method, received_on, reference, notes, metadata,
                           created_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function parseDateOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.slice(0, 10);
  return null;
}

function rowToPayment(row: any): Payment {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    userId: row.user_id,
    amountCents: Number(row.amount_cents ?? 0),
    currency: row.currency ?? 'USD',
    method: row.method as PaymentMethod,
    receivedOn: parseDateOrNull(row.received_on) ?? '',
    reference: row.reference ?? null,
    notes: row.notes ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
  };
}

// ─── Invoice ownership helper ─────────────────────────────────────────────

async function validateInvoiceOwnership(
  invoiceId: string,
  userId: string,
): Promise<boolean> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_business_invoices
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [invoiceId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listPayments(
  userId: string,
  opts: PaymentsListOpts = {},
): Promise<Payment[]> {
  const pool = getBusinessPool();
  const params: any[] = [userId];
  const where: string[] = [`user_id = $1`];

  if (opts.invoiceId) {
    if (!(await validateInvoiceOwnership(opts.invoiceId, userId))) {
      return [];
    }
    params.push(opts.invoiceId);
    where.push(`invoice_id = $${params.length}`);
  }

  if (opts.from) {
    params.push(opts.from);
    where.push(`received_on >= $${params.length}`);
  }

  if (opts.to) {
    params.push(opts.to);
    where.push(`received_on <= $${params.length}`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${PAYMENT_COLUMNS}
       FROM agos_business_payments
      WHERE ${where.join(' AND ')}
      ORDER BY received_on DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToPayment);
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getPayment(
  id: string,
  userId: string,
): Promise<Payment | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${PAYMENT_COLUMNS}
       FROM agos_business_payments
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToPayment(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createPayment(
  userId: string,
  data: CreatePaymentInput,
): Promise<Payment> {
  if (!(await validateInvoiceOwnership(data.invoiceId, userId))) {
    throw new Error('Invoice not found or access denied');
  }

  const pool = getBusinessPool();
  const id = randomUUID();
  const today = new Date().toISOString().slice(0, 10);

  await pool.query(
    `INSERT INTO agos_business_payments
       (id, invoice_id, user_id, amount_cents, currency, method,
        received_on, reference, notes, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [
      id,
      data.invoiceId,
      userId,
      data.amountCents,
      data.currency ?? 'USD',
      data.method ?? 'bank_transfer',
      data.receivedOn ?? today,
      data.reference ?? null,
      data.notes ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  // Reconcile paid_cents on parent invoice (may flip status to 'paid')
  await reconcilePaidCents(data.invoiceId, userId);

  const after = await getPayment(id, userId);
  if (!after) throw new Error('Failed to create payment');
  return after;
}

// ─── Update ───────────────────────────────────────────────────────────────

export type UpdatePaymentOutcome =
  | { kind: 'ok'; payment: Payment }
  | { kind: 'not_found' };

export async function updatePayment(
  id: string,
  userId: string,
  patch: UpdatePaymentInput,
): Promise<UpdatePaymentOutcome> {
  const before = await getPayment(id, userId);
  if (!before) return { kind: 'not_found' };

  const pool = getBusinessPool();
  const set: string[] = [];
  const params: any[] = [id, userId];
  let n = 2;

  if (patch.amountCents !== undefined) {
    params.push(patch.amountCents);
    n += 1;
    set.push(`amount_cents = $${n}`);
  }
  if (patch.currency !== undefined) {
    params.push(patch.currency);
    n += 1;
    set.push(`currency = $${n}`);
  }
  if (patch.method !== undefined) {
    params.push(patch.method);
    n += 1;
    set.push(`method = $${n}`);
  }
  if (patch.receivedOn !== undefined) {
    params.push(patch.receivedOn);
    n += 1;
    set.push(`received_on = $${n}`);
  }
  if (patch.reference !== undefined) {
    params.push(patch.reference);
    n += 1;
    set.push(`reference = $${n}`);
  }
  if (patch.notes !== undefined) {
    params.push(patch.notes);
    n += 1;
    set.push(`notes = $${n}`);
  }
  if (patch.metadata !== undefined) {
    params.push(JSON.stringify(patch.metadata));
    n += 1;
    set.push(`metadata = $${n}::jsonb`);
  }

  if (set.length === 0) {
    return { kind: 'ok', payment: before };
  }

  const r = await pool.query(
    `UPDATE agos_business_payments
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };

  // Reconcile paid_cents on parent invoice after edit
  await reconcilePaidCents(before.invoiceId, userId);

  const after = await getPayment(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', payment: after };
}

// ─── Delete ───────────────────────────────────────────────────────────────

export async function deletePayment(
  id: string,
  userId: string,
): Promise<boolean> {
  const before = await getPayment(id, userId);
  if (!before) return false;

  const pool = getBusinessPool();
  const r = await pool.query(
    `DELETE FROM agos_business_payments
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  const deleted = (r.rowCount ?? 0) > 0;

  if (deleted) {
    await reconcilePaidCents(before.invoiceId, userId);
  }

  return deleted;
}

// ─── Ownership check ─────────────────────────────────────────────────────

export async function validatePaymentOwnership(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_business_payments
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}
