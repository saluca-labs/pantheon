/**
 * Business OS Phase 4 — invoices DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. An invoice id belonging to another user returns null on get /
 * update / delete.
 *
 * Delete is hard and only allowed for draft invoices.  Status transitions
 * (send, void) carry guard checks.  `reconcilePaidCents` is called by the
 * payments repo after every payment mutation to keep `paid_cents` in sync.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import {
  INVOICE_STATUSES,
  type Invoice,
  type InvoiceStatus,
  type CreateInvoiceInput,
  type UpdateInvoiceInput,
  type InvoicesListOpts,
} from './invoices';

const INVOICE_COLUMNS = `id, user_id, deal_id, contact_id, project_id,
                           quote_id, invoice_number, title, description_md,
                           status, invoice_date, due_on, terms,
                           subtotal_cents, tax_cents, total_cents,
                           paid_cents, currency, pdf_url, metadata,
                           created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

function parseDateOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.slice(0, 10);
  return null;
}

interface RawInvoiceRow {
  id: string;
  user_id: string;
  deal_id: string | null;
  contact_id: string | null;
  project_id: string | null;
  quote_id: string | null;
  invoice_number: string;
  title: string;
  description_md: string | null;
  status: string;
  invoice_date: Date | string | null;
  due_on: Date | string | null;
  terms: string | null;
  subtotal_cents: number | string | null;
  tax_cents: number | string | null;
  total_cents: number | string | null;
  paid_cents: number | string | null;
  currency: string | null;
  pdf_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToInvoice(row: RawInvoiceRow): Invoice {
  return {
    id: row.id,
    userId: row.user_id,
    dealId: row.deal_id ?? null,
    contactId: row.contact_id ?? null,
    projectId: row.project_id ?? null,
    quoteId: row.quote_id ?? null,
    invoiceNumber: row.invoice_number,
    title: row.title,
    descriptionMd: row.description_md ?? '',
    status: row.status as InvoiceStatus,
    invoiceDate: parseDateOrNull(row.invoice_date) ?? '',
    dueOn: parseDateOrNull(row.due_on) ?? '',
    terms: row.terms ?? '',
    subtotalCents: Number(row.subtotal_cents ?? 0),
    taxCents: Number(row.tax_cents ?? 0),
    totalCents: Number(row.total_cents ?? 0),
    paidCents: Number(row.paid_cents ?? 0),
    currency: row.currency ?? 'USD',
    pdfUrl: row.pdf_url ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listInvoices(
  userId: string,
  opts: InvoicesListOpts = {},
): Promise<Invoice[]> {
  const pool = getBusinessPool();
  const params: unknown[] =[userId];
  const where: string[] = [`user_id = $1`];

  if (opts.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    const placeholders = statuses.map(() => {
      params.push(null);
      return `$${params.length}`;
    });
    params.splice(
      params.length - statuses.length,
      statuses.length,
      ...statuses,
    );
    where.push(`status IN (${placeholders.join(', ')})`);
  }

  if (opts.outstanding === true) {
    where.push(`status IN ('sent','partial','overdue')`);
  }

  if (opts.contactId) {
    params.push(opts.contactId);
    where.push(`contact_id = $${params.length}`);
  }

  if (opts.projectId) {
    params.push(opts.projectId);
    where.push(`project_id = $${params.length}`);
  }

  if (opts.dealId) {
    params.push(opts.dealId);
    where.push(`deal_id = $${params.length}`);
  }

  if (opts.from) {
    params.push(opts.from);
    where.push(`invoice_date >= $${params.length}`);
  }

  if (opts.to) {
    params.push(opts.to);
    where.push(`invoice_date <= $${params.length}`);
  }

  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    where.push(
      `(LOWER(title) LIKE $${params.length}
        OR LOWER(COALESCE(description_md, '')) LIKE $${params.length})`,
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const orderBy =
    opts.outstanding === true
      ? `due_on ASC, invoice_date DESC`
      : `invoice_date DESC`;

  const r = await pool.query(
    `SELECT ${INVOICE_COLUMNS}
       FROM agos_business_invoices
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToInvoice);
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getInvoice(
  id: string,
  userId: string,
): Promise<Invoice | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${INVOICE_COLUMNS}
       FROM agos_business_invoices
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToInvoice(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createInvoice(
  userId: string,
  data: CreateInvoiceInput,
): Promise<Invoice> {
  const pool = getBusinessPool();
  const id = randomUUID();
  const today = new Date().toISOString().slice(0, 10);

  // dueOn default: today + 30 days unless explicitly set
  let dueOn = data.dueOn;
  if (dueOn == null && data.invoiceDate == null) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    dueOn = d.toISOString().slice(0, 10);
  } else if (dueOn == null && data.invoiceDate) {
    const d = new Date(data.invoiceDate);
    d.setDate(d.getDate() + 30);
    dueOn = d.toISOString().slice(0, 10);
  }

  await pool.query(
    `INSERT INTO agos_business_invoices
       (id, user_id, contact_id, deal_id, project_id, quote_id,
        invoice_number, title, description_md, status, invoice_date,
        due_on, terms, subtotal_cents, tax_cents, total_cents,
        paid_cents, currency, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb)`,
    [
      id,
      userId,
      data.contactId ?? null,
      data.dealId ?? null,
      data.projectId ?? null,
      data.quoteId ?? null,
      data.invoiceNumber,
      data.title,
      data.descriptionMd ?? '',
      data.status ?? 'draft',
      data.invoiceDate ?? today,
      dueOn ?? today,
      data.terms ?? '',
      0, // subtotalCents — derived from line items
      0, // taxCents
      0, // totalCents
      0, // paidCents
      data.currency ?? 'USD',
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const after = await getInvoice(id, userId);
  if (!after) throw new Error('Failed to create invoice');
  return after;
}

// ─── Update ───────────────────────────────────────────────────────────────

export type UpdateInvoiceOutcome =
  | { kind: 'ok'; invoice: Invoice }
  | { kind: 'not_found' };

export async function updateInvoice(
  id: string,
  userId: string,
  patch: UpdateInvoiceInput,
): Promise<UpdateInvoiceOutcome> {
  const pool = getBusinessPool();
  const set: string[] = [];
  const params: unknown[] =[id, userId];
  let n = 2;

  if (patch.title !== undefined) {
    params.push(patch.title);
    n += 1;
    set.push(`title = $${n}`);
  }
  if (patch.invoiceNumber !== undefined) {
    params.push(patch.invoiceNumber);
    n += 1;
    set.push(`invoice_number = $${n}`);
  }
  if (patch.contactId !== undefined) {
    params.push(patch.contactId);
    n += 1;
    set.push(`contact_id = $${n}`);
  }
  if (patch.dealId !== undefined) {
    params.push(patch.dealId);
    n += 1;
    set.push(`deal_id = $${n}`);
  }
  if (patch.projectId !== undefined) {
    params.push(patch.projectId);
    n += 1;
    set.push(`project_id = $${n}`);
  }
  if (patch.descriptionMd !== undefined) {
    params.push(patch.descriptionMd);
    n += 1;
    set.push(`description_md = $${n}`);
  }
  if (patch.invoiceDate !== undefined) {
    params.push(patch.invoiceDate);
    n += 1;
    set.push(`invoice_date = $${n}`);
  }
  if (patch.dueOn !== undefined) {
    params.push(patch.dueOn);
    n += 1;
    set.push(`due_on = $${n}`);
  }
  if (patch.terms !== undefined) {
    params.push(patch.terms);
    n += 1;
    set.push(`terms = $${n}`);
  }
  if (patch.currency !== undefined) {
    params.push(patch.currency);
    n += 1;
    set.push(`currency = $${n}`);
  }
  if (patch.metadata !== undefined) {
    params.push(JSON.stringify(patch.metadata));
    n += 1;
    set.push(`metadata = $${n}::jsonb`);
  }

  if (set.length === 0) {
    const current = await getInvoice(id, userId);
    return current
      ? { kind: 'ok', invoice: current }
      : { kind: 'not_found' };
  }

  set.push(`updated_at = now()`);

  const r = await pool.query(
    `UPDATE agos_business_invoices
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getInvoice(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', invoice: after };
}

// ─── Delete (hard — draft only) ───────────────────────────────────────────

export type DeleteInvoiceOutcome =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'not_draft'; reason: string };

export async function deleteInvoice(
  id: string,
  userId: string,
): Promise<DeleteInvoiceOutcome> {
  const before = await getInvoice(id, userId);
  if (!before) return { kind: 'not_found' };
  if (before.status !== 'draft') {
    return {
      kind: 'not_draft',
      reason: `Invoice status is "${before.status}", only draft invoices can be deleted`,
    };
  }

  const pool = getBusinessPool();
  await pool.query(
    `DELETE FROM agos_business_invoices
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return { kind: 'ok' };
}

// ─── Update totals from line items ───────────────────────────────────────

export async function updateInvoiceTotals(
  id: string,
  userId: string,
): Promise<Invoice | null> {
  const pool = getBusinessPool();

  const sumR = await pool.query(
    `SELECT COALESCE(SUM(line_total_cents), 0) AS subtotal,
            COALESCE(SUM(line_tax_cents), 0)   AS tax
       FROM agos_business_line_items
      WHERE invoice_id = $1`,
    [id],
  );

  const subtotal = Number(sumR.rows[0]?.subtotal ?? 0);
  const tax = Number(sumR.rows[0]?.tax ?? 0);
  const total = subtotal + tax;

  const r = await pool.query(
    `UPDATE agos_business_invoices
        SET subtotal_cents = $3,
            tax_cents      = $4,
            total_cents    = $5,
            updated_at     = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId, subtotal, tax, total],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getInvoice(id, userId);
}

// ─── Reconcile paid_cents from payments ──────────────────────────────────

export async function reconcilePaidCents(
  id: string,
  userId: string,
): Promise<Invoice | null> {
  const pool = getBusinessPool();

  const sumR = await pool.query(
    `SELECT COALESCE(SUM(amount_cents), 0) AS paid
       FROM agos_business_payments
      WHERE invoice_id = $1`,
    [id],
  );

  const paid = Number(sumR.rows[0]?.paid ?? 0);

  // Auto-transition status when fully paid
  const r = await pool.query(
    `UPDATE agos_business_invoices
        SET paid_cents = $3,
            status     = CASE
              WHEN $3 >= total_cents
               AND status IN ('sent','partial')
              THEN 'paid'::text
              ELSE status
            END,
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId, paid],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getInvoice(id, userId);
}

// ─── Send (draft → sent) ─────────────────────────────────────────────────

export type SendInvoiceOutcome =
  | { kind: 'ok'; invoice: Invoice }
  | { kind: 'not_found' }
  | { kind: 'invalid_transition'; reason: string };

export async function sendInvoice(
  id: string,
  userId: string,
): Promise<SendInvoiceOutcome> {
  const before = await getInvoice(id, userId);
  if (!before) return { kind: 'not_found' };
  if (before.status !== 'draft') {
    return {
      kind: 'invalid_transition',
      reason: `Invoice status is "${before.status}", not draft`,
    };
  }

  const pool = getBusinessPool();
  const r = await pool.query(
    `UPDATE agos_business_invoices
        SET status     = 'sent',
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getInvoice(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', invoice: after };
}

// ─── Void (sent / partial / overdue → voided) ────────────────────────────

export type VoidInvoiceOutcome =
  | { kind: 'ok'; invoice: Invoice }
  | { kind: 'not_found' }
  | { kind: 'invalid_transition'; reason: string };

export async function voidInvoice(
  id: string,
  userId: string,
): Promise<VoidInvoiceOutcome> {
  const before = await getInvoice(id, userId);
  if (!before) return { kind: 'not_found' };
  if (!['sent', 'partial', 'overdue'].includes(before.status)) {
    return {
      kind: 'invalid_transition',
      reason: `Invoice status is "${before.status}", can only void sent/partial/overdue invoices`,
    };
  }

  const pool = getBusinessPool();
  const r = await pool.query(
    `UPDATE agos_business_invoices
        SET status     = 'voided',
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getInvoice(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', invoice: after };
}

// ─── Mark as overdue (display-state helper) ──────────────────────────────

/**
 * Sets status = 'overdue' on invoices that are sent or partial and past
 * their due date.  This is an explicit marker called by a scheduled job or
 * on-demand from the BFF — it is NOT automatically enforced by queries.
 * Queries can compute "is overdue" client-side from due_on < today() without
 * flipping the column, but the UI standard is to call this helper first.
 */
export async function markAsOverdue(
  id: string,
  userId: string,
): Promise<Invoice | null> {
  const today = new Date().toISOString().slice(0, 10);
  const pool = getBusinessPool();
  const r = await pool.query(
    `UPDATE agos_business_invoices
        SET status     = 'overdue',
            updated_at = now()
      WHERE id = $1 AND user_id = $2
        AND status IN ('sent', 'partial')
        AND due_on < $3
      RETURNING id`,
    [id, userId, today],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getInvoice(id, userId);
}

// ─── Ownership check ─────────────────────────────────────────────────────

export async function validateInvoiceOwnership(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_business_invoices
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}
