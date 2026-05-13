/**
 * Business OS Phase 4 — quotes DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. A quote id belonging to another user returns null on get /
 * update / delete.
 *
 * Archive is soft (sets archived_at = now()). Delete is hard (DELETE FROM)
 * and only allowed for draft quotes.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import {
  QUOTE_STATUSES,
  type Quote,
  type QuoteStatus,
  type CreateQuoteInput,
  type UpdateQuoteInput,
  type QuotesListOpts,
} from './quotes';

const QUOTE_COLUMNS = `id, user_id, deal_id, contact_id, project_id,
                         quote_number, title, description_md, status,
                         quote_date, expires_on, subtotal_cents, tax_cents,
                         total_cents, currency, converted_invoice_id,
                         metadata, archived_at, created_at, updated_at`;

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

function rowToQuote(row: any): Quote {
  return {
    id: row.id,
    userId: row.user_id,
    dealId: row.deal_id ?? null,
    contactId: row.contact_id ?? null,
    projectId: row.project_id ?? null,
    quoteNumber: row.quote_number,
    title: row.title,
    descriptionMd: row.description_md ?? '',
    status: row.status as QuoteStatus,
    quoteDate: parseDateOrNull(row.quote_date) ?? '',
    expiresOn: parseDateOrNull(row.expires_on),
    subtotalCents: Number(row.subtotal_cents ?? 0),
    taxCents: Number(row.tax_cents ?? 0),
    totalCents: Number(row.total_cents ?? 0),
    currency: row.currency ?? 'USD',
    convertedInvoiceId: row.converted_invoice_id ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    archivedAt: toIsoOrNull(row.archived_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listQuotes(
  userId: string,
  opts: QuotesListOpts = {},
): Promise<Quote[]> {
  const pool = getBusinessPool();
  const params: any[] = [userId];
  const where: string[] = [`user_id = $1`];

  if (opts.archived === true) {
    where.push(`archived_at IS NOT NULL`);
  } else {
    where.push(`archived_at IS NULL`);
  }

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

  if (opts.contactId) {
    params.push(opts.contactId);
    where.push(`contact_id = $${params.length}`);
  }

  if (opts.dealId) {
    params.push(opts.dealId);
    where.push(`deal_id = $${params.length}`);
  }

  if (opts.projectId) {
    params.push(opts.projectId);
    where.push(`project_id = $${params.length}`);
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

  const r = await pool.query(
    `SELECT ${QUOTE_COLUMNS}
       FROM agos_business_quotes
      WHERE ${where.join(' AND ')}
      ORDER BY quote_date DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToQuote);
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getQuote(
  id: string,
  userId: string,
): Promise<Quote | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${QUOTE_COLUMNS}
       FROM agos_business_quotes
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToQuote(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createQuote(
  userId: string,
  data: CreateQuoteInput,
): Promise<Quote> {
  const pool = getBusinessPool();
  const id = randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO agos_business_quotes
       (id, user_id, contact_id, deal_id, project_id, quote_number, title,
        description_md, status, quote_date, expires_on, subtotal_cents,
        tax_cents, total_cents, currency, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
    [
      id,
      userId,
      data.contactId ?? null,
      data.dealId ?? null,
      data.projectId ?? null,
      data.quoteNumber,
      data.title,
      data.descriptionMd ?? '',
      data.status ?? 'draft',
      data.quoteDate ?? today,
      data.expiresOn ?? null,
      0, // subtotalCents — derived from line items
      0, // taxCents
      0, // totalCents
      data.currency ?? 'USD',
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const after = await getQuote(id, userId);
  if (!after) throw new Error('Failed to create quote');
  return after;
}

// ─── Update ───────────────────────────────────────────────────────────────

export type UpdateQuoteOutcome =
  | { kind: 'ok'; quote: Quote }
  | { kind: 'not_found' };

export async function updateQuote(
  id: string,
  userId: string,
  patch: UpdateQuoteInput,
): Promise<UpdateQuoteOutcome> {
  const pool = getBusinessPool();
  const set: string[] = [];
  const params: any[] = [id, userId];
  let n = 2;

  if (patch.title !== undefined) {
    params.push(patch.title);
    n += 1;
    set.push(`title = $${n}`);
  }
  if (patch.quoteNumber !== undefined) {
    params.push(patch.quoteNumber);
    n += 1;
    set.push(`quote_number = $${n}`);
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
  if (patch.status !== undefined) {
    params.push(patch.status);
    n += 1;
    set.push(`status = $${n}`);
  }
  if (patch.quoteDate !== undefined) {
    params.push(patch.quoteDate);
    n += 1;
    set.push(`quote_date = $${n}`);
  }
  if (patch.expiresOn !== undefined) {
    params.push(patch.expiresOn);
    n += 1;
    set.push(`expires_on = $${n}`);
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
    const current = await getQuote(id, userId);
    return current ? { kind: 'ok', quote: current } : { kind: 'not_found' };
  }

  set.push(`updated_at = now()`);

  const r = await pool.query(
    `UPDATE agos_business_quotes
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getQuote(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', quote: after };
}

// ─── Delete (hard — draft only) ───────────────────────────────────────────

export type DeleteQuoteOutcome =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'not_draft'; reason: string };

export async function deleteQuote(
  id: string,
  userId: string,
): Promise<DeleteQuoteOutcome> {
  const before = await getQuote(id, userId);
  if (!before) return { kind: 'not_found' };
  if (before.status !== 'draft') {
    return {
      kind: 'not_draft',
      reason: `Quote status is "${before.status}", only draft quotes can be deleted`,
    };
  }

  const pool = getBusinessPool();
  await pool.query(
    `DELETE FROM agos_business_quotes
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return { kind: 'ok' };
}

// ─── Update totals from line items ───────────────────────────────────────

export async function updateQuoteTotals(
  id: string,
  userId: string,
): Promise<Quote | null> {
  const pool = getBusinessPool();

  // Recompute from line items
  const sumR = await pool.query(
    `SELECT COALESCE(SUM(line_total_cents), 0) AS subtotal,
            COALESCE(SUM(line_tax_cents), 0)   AS tax
       FROM agos_business_line_items
      WHERE quote_id = $1`,
    [id],
  );

  const subtotal = Number(sumR.rows[0]?.subtotal ?? 0);
  const tax = Number(sumR.rows[0]?.tax ?? 0);
  const total = subtotal + tax;

  const r = await pool.query(
    `UPDATE agos_business_quotes
        SET subtotal_cents = $3,
            tax_cents      = $4,
            total_cents    = $5,
            updated_at     = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId, subtotal, tax, total],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getQuote(id, userId);
}

// ─── Archive / restore ───────────────────────────────────────────────────

export async function archiveQuote(
  id: string,
  userId: string,
): Promise<Quote | null> {
  const pool = getBusinessPool();
  await pool.query(
    `UPDATE agos_business_quotes
        SET archived_at = now(),
            updated_at  = now()
      WHERE id = $1 AND user_id = $2
        AND archived_at IS NULL`,
    [id, userId],
  );
  return getQuote(id, userId);
}

export async function restoreQuote(
  id: string,
  userId: string,
): Promise<
  | { quote: Quote; alreadyActive: false }
  | { quote: Quote; alreadyActive: true }
  | null
> {
  const before = await getQuote(id, userId);
  if (!before) return null;
  if (before.archivedAt == null) {
    return { quote: before, alreadyActive: true };
  }
  const pool = getBusinessPool();
  await pool.query(
    `UPDATE agos_business_quotes
        SET archived_at = NULL,
            updated_at  = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  const after = await getQuote(id, userId);
  if (!after) return null;
  return { quote: after, alreadyActive: false };
}

// ─── Convert to invoice ──────────────────────────────────────────────────

export async function convertQuote(
  id: string,
  userId: string,
  invoiceId: string,
): Promise<Quote | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `UPDATE agos_business_quotes
        SET status              = 'converted',
            converted_invoice_id = $3,
            updated_at           = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId, invoiceId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getQuote(id, userId);
}

// ─── Ownership check ─────────────────────────────────────────────────────

export async function validateQuoteOwnership(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_business_quotes
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}
