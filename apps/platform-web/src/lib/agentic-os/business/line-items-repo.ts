/**
 * Business OS Phase 4 — line-items DB repository.
 *
 * Handles line items for BOTH quotes and invoices via the XOR pattern.
 * Every mutation recomputes parent totals (quote or invoice) so the
 * subtotal / tax / total columns stay in sync without cron or triggers.
 *
 * Cross-ownership contract: validates parent ownership on every operation.
 * A line-item id for a parent that belongs to another user returns null.
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import { updateQuoteTotals } from './quotes-repo';
import { updateInvoiceTotals } from './invoices-repo';
import type {
  LineItem,
  LineItemParentType,
  CreateLineItemInput,
  UpdateLineItemInput,
} from './line-items';
import {
  computeLineTotal,
  computeTax,
} from './line-items';

const LI_COLUMNS = `id, quote_id, invoice_id, user_id, position,
                      description, quantity, unit_label, unit_price_cents,
                      line_total_cents, tax_rate_bp, line_tax_cents,
                      time_entry_ids, metadata, created_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

interface RawLineItemRow {
  id: string;
  quote_id: string | null;
  invoice_id: string | null;
  user_id: string;
  position: number | string | null;
  description: string | null;
  quantity: number | string | null;
  unit_label: string | null;
  unit_price_cents: number | string | null;
  line_total_cents: number | string | null;
  tax_rate_bp: number | string | null;
  line_tax_cents: number | string | null;
  time_entry_ids: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
}

function rowToLineItem(row: RawLineItemRow): LineItem {
  return {
    id: row.id,
    quoteId: row.quote_id ?? null,
    invoiceId: row.invoice_id ?? null,
    userId: row.user_id,
    position: Number(row.position ?? 0),
    description: row.description ?? '',
    quantity: Number(row.quantity ?? 1),
    unitLabel: row.unit_label ?? '',
    unitPriceCents: Number(row.unit_price_cents ?? 0),
    lineTotalCents: Number(row.line_total_cents ?? 0),
    taxRateBp: Number(row.tax_rate_bp ?? 0),
    lineTaxCents: Number(row.line_tax_cents ?? 0),
    timeEntryIds: Array.isArray(row.time_entry_ids) ? row.time_entry_ids : [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
  };
}

// ─── Parent ownership helpers ─────────────────────────────────────────────

async function validateParentOwnership(
  parentType: LineItemParentType,
  parentId: string,
  userId: string,
): Promise<boolean> {
  const pool = getBusinessPool();
  const table =
    parentType === 'quote'
      ? 'agos_business_quotes'
      : 'agos_business_invoices';
  const r = await pool.query(
    `SELECT 1 FROM ${table}
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [parentId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Recompute parent totals after a line-item mutation. */
async function reconcileParentTotals(
  parentType: LineItemParentType,
  parentId: string,
  userId: string,
): Promise<void> {
  if (parentType === 'quote') {
    await updateQuoteTotals(parentId, userId);
  } else {
    await updateInvoiceTotals(parentId, userId);
  }
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listLineItems(
  parentType: LineItemParentType,
  parentId: string,
  userId: string,
): Promise<LineItem[]> {
  if (!(await validateParentOwnership(parentType, parentId, userId))) {
    return [];
  }

  const pool = getBusinessPool();
  const parentCol = parentType === 'quote' ? 'quote_id' : 'invoice_id';
  const r = await pool.query(
    `SELECT ${LI_COLUMNS}
       FROM agos_business_line_items
      WHERE ${parentCol} = $1 AND user_id = $2
      ORDER BY position ASC`,
    [parentId, userId],
  );
  return r.rows.map(rowToLineItem);
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getLineItem(
  id: string,
  parentType: LineItemParentType,
  parentId: string,
  userId: string,
): Promise<LineItem | null> {
  const pool = getBusinessPool();
  const parentCol = parentType === 'quote' ? 'quote_id' : 'invoice_id';
  const r = await pool.query(
    `SELECT ${LI_COLUMNS}
       FROM agos_business_line_items
      WHERE id = $1 AND ${parentCol} = $2 AND user_id = $3
      LIMIT 1`,
    [id, parentId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToLineItem(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createLineItem(
  parentType: LineItemParentType,
  parentId: string,
  userId: string,
  data: CreateLineItemInput,
): Promise<LineItem> {
  if (!(await validateParentOwnership(parentType, parentId, userId))) {
    throw new Error(`Parent ${parentType} not found or access denied`);
  }

  const pool = getBusinessPool();
  const id = randomUUID();

  // Resolve parentId fields
  const quoteId = parentType === 'quote' ? parentId : null;
  const invoiceId = parentType === 'invoice' ? parentId : null;

  // Auto-position: one past the current max, or use caller-supplied value
  const parentCol = parentType === 'quote' ? 'quote_id' : 'invoice_id';
  let position = data.position ?? 0;
  if (data.position === undefined) {
    const maxR = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
         FROM agos_business_line_items
        WHERE ${parentCol} = $1 AND user_id = $2`,
      [parentId, userId],
    );
    position = Number(maxR.rows[0]?.next_pos ?? 0);
  }

  const quantity = data.quantity ?? 1;
  const unitPriceCents = data.unitPriceCents ?? 0;
  const taxRateBp = data.taxRateBp ?? 0;
  const lineTotalCents = computeLineTotal(quantity, unitPriceCents);
  const lineTaxCents = computeTax(lineTotalCents, taxRateBp);

  await pool.query(
    `INSERT INTO agos_business_line_items
       (id, quote_id, invoice_id, user_id, position, description, quantity,
        unit_label, unit_price_cents, line_total_cents, tax_rate_bp,
        line_tax_cents, time_entry_ids, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::uuid[],$14::jsonb)`,
    [
      id,
      quoteId,
      invoiceId,
      userId,
      position,
      data.description ?? '',
      quantity,
      data.unitLabel ?? '',
      unitPriceCents,
      lineTotalCents,
      taxRateBp,
      lineTaxCents,
      data.timeEntryIds ?? [],
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  await reconcileParentTotals(parentType, parentId, userId);

  const after = await getLineItem(id, parentType, parentId, userId);
  if (!after) throw new Error('Failed to create line item');
  return after;
}

// ─── Update ───────────────────────────────────────────────────────────────

export type UpdateLineItemOutcome =
  | { kind: 'ok'; item: LineItem }
  | { kind: 'not_found' };

export async function updateLineItem(
  id: string,
  parentType: LineItemParentType,
  parentId: string,
  userId: string,
  patch: UpdateLineItemInput,
): Promise<UpdateLineItemOutcome> {
  if (!(await validateParentOwnership(parentType, parentId, userId))) {
    return { kind: 'not_found' };
  }

  const pool = getBusinessPool();
  const parentCol = parentType === 'quote' ? 'quote_id' : 'invoice_id';
  const set: string[] = [];
  const params: unknown[] =[id, parentId, userId];
  let n = 3;

  if (patch.description !== undefined) {
    params.push(patch.description);
    n += 1;
    set.push(`description = $${n}`);
  }
  if (patch.quantity !== undefined) {
    params.push(patch.quantity);
    n += 1;
    set.push(`quantity = $${n}`);
  }
  if (patch.unitLabel !== undefined) {
    params.push(patch.unitLabel);
    n += 1;
    set.push(`unit_label = $${n}`);
  }
  if (patch.unitPriceCents !== undefined) {
    params.push(patch.unitPriceCents);
    n += 1;
    set.push(`unit_price_cents = $${n}`);
  }
  if (patch.taxRateBp !== undefined) {
    params.push(patch.taxRateBp);
    n += 1;
    set.push(`tax_rate_bp = $${n}`);
  }
  if (patch.position !== undefined) {
    params.push(patch.position);
    n += 1;
    set.push(`position = $${n}`);
  }
  if (patch.metadata !== undefined) {
    params.push(JSON.stringify(patch.metadata));
    n += 1;
    set.push(`metadata = $${n}::jsonb`);
  }

  if (set.length === 0) {
    const current = await getLineItem(id, parentType, parentId, userId);
    return current
      ? { kind: 'ok', item: current }
      : { kind: 'not_found' };
  }

  // Recompute derived fields with current DB values if quantity, price, or
  // tax rate changed.  We fetch current snapshot first, merge the patch, and
  // write recalculated totals.
  const before = await getLineItem(id, parentType, parentId, userId);
  if (!before) return { kind: 'not_found' };

  const qty = patch.quantity ?? before.quantity;
  const price = patch.unitPriceCents ?? before.unitPriceCents;
  const rate = patch.taxRateBp ?? before.taxRateBp;
  const newTotal = computeLineTotal(qty, price);
  const newTax = computeTax(newTotal, rate);

  n += 1;
  set.push(`line_total_cents = $${n}`);
  params.push(newTotal);
  n += 1;
  set.push(`line_tax_cents = $${n}`);
  params.push(newTax);

  const r = await pool.query(
    `UPDATE agos_business_line_items
        SET ${set.join(', ')}
      WHERE id = $1 AND ${parentCol} = $2 AND user_id = $3
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };

  await reconcileParentTotals(parentType, parentId, userId);

  const after = await getLineItem(id, parentType, parentId, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', item: after };
}

// ─── Delete ───────────────────────────────────────────────────────────────

export async function deleteLineItem(
  id: string,
  parentType: LineItemParentType,
  parentId: string,
  userId: string,
): Promise<boolean> {
  const pool = getBusinessPool();
  const parentCol = parentType === 'quote' ? 'quote_id' : 'invoice_id';
  const r = await pool.query(
    `DELETE FROM agos_business_line_items
      WHERE id = $1 AND ${parentCol} = $2 AND user_id = $3`,
    [id, parentId, userId],
  );
  const deleted = (r.rowCount ?? 0) > 0;
  if (deleted) {
    await reconcileParentTotals(parentType, parentId, userId);
  }
  return deleted;
}
