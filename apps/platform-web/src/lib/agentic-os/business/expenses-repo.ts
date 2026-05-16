/**
 * Business OS Phase 5 — expenses DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. An expense id belonging to another user returns null on get /
 * update / delete.
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import {
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type CreateExpenseInput,
  type UpdateExpenseInput,
  type ExpensesListOpts,
} from './expenses';

const EXPENSE_COLUMNS = `id, user_id, project_id, category, vendor, description,
                           amount_cents, currency, incurred_on, paid_on,
                           receipt_url, is_reimbursable, reimbursed_at,
                           tags, metadata, created_at, updated_at`;

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

function toBoolean(v: unknown): boolean {
  return Boolean(v);
}

interface RawExpenseRow {
  id: string;
  user_id: string;
  project_id: string | null;
  category: string;
  vendor: string | null;
  description: string | null;
  amount_cents: number | string | null;
  currency: string | null;
  incurred_on: Date | string | null;
  paid_on: Date | string | null;
  receipt_url: string | null;
  is_reimbursable: boolean;
  reimbursed_at: Date | string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToExpense(row: RawExpenseRow): Expense {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id ?? null,
    category: row.category as ExpenseCategory,
    vendor: row.vendor ?? null,
    description: row.description ?? '',
    amountCents: Number(row.amount_cents ?? 0),
    currency: row.currency ?? 'USD',
    incurredOn: parseDateOrNull(row.incurred_on) ?? '',
    paidOn: parseDateOrNull(row.paid_on),
    receiptUrl: row.receipt_url ?? null,
    isReimbursable: toBoolean(row.is_reimbursable),
    reimbursedAt: toIsoOrNull(row.reimbursed_at),
    tags: (row.tags as string[]) ?? [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listExpenses(
  userId: string,
  opts: ExpensesListOpts = {},
): Promise<Expense[]> {
  const pool = getBusinessPool();
  const params: unknown[] =[userId];
  const where: string[] = [`user_id = $1`];

  if (opts.category) {
    const cats = Array.isArray(opts.category) ? opts.category : [opts.category];
    const placeholders = cats.map(() => {
      params.push(null);
      return `$${params.length}`;
    });
    params.splice(
      params.length - cats.length,
      cats.length,
      ...cats,
    );
    where.push(`category IN (${placeholders.join(', ')})`);
  }

  if (opts.projectId) {
    params.push(opts.projectId);
    where.push(`project_id = $${params.length}`);
  }

  if (opts.from) {
    params.push(opts.from);
    where.push(`incurred_on >= $${params.length}::date`);
  }

  if (opts.to) {
    params.push(opts.to);
    where.push(`incurred_on <= $${params.length}::date`);
  }

  if (opts.tag) {
    params.push(opts.tag);
    where.push(`tags @> ARRAY[$${params.length}]`);
  }

  if (opts.reimbursable === true) {
    where.push(`is_reimbursable = true`);
  }

  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    where.push(
      `(LOWER(description) LIKE $${params.length}
        OR LOWER(COALESCE(vendor, '')) LIKE $${params.length})`,
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${EXPENSE_COLUMNS}
       FROM agos_business_expenses
      WHERE ${where.join(' AND ')}
      ORDER BY incurred_on DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToExpense);
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getExpense(
  id: string,
  userId: string,
): Promise<Expense | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${EXPENSE_COLUMNS}
       FROM agos_business_expenses
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToExpense(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createExpense(
  userId: string,
  data: CreateExpenseInput,
): Promise<Expense> {
  const pool = getBusinessPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO agos_business_expenses
       (id, user_id, project_id, category, vendor, description, amount_cents,
        currency, incurred_on, paid_on, receipt_url, is_reimbursable,
        tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::text[],$14::jsonb)`,
    [
      id,
      userId,
      data.projectId ?? null,
      data.category ?? 'general',
      data.vendor ?? null,
      data.description ?? '',
      data.amountCents,
      data.currency ?? 'USD',
      data.incurredOn,
      data.paidOn ?? null,
      data.receiptUrl ?? null,
      data.isReimbursable ?? false,
      data.tags ?? [],
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const after = await getExpense(id, userId);
  if (!after) throw new Error('Failed to create expense');
  return after;
}

// ─── Update ───────────────────────────────────────────────────────────────

export type UpdateExpenseOutcome =
  | { kind: 'ok'; expense: Expense }
  | { kind: 'not_found' };

export async function updateExpense(
  id: string,
  userId: string,
  patch: UpdateExpenseInput,
): Promise<UpdateExpenseOutcome> {
  const pool = getBusinessPool();
  const set: string[] = [];
  const params: unknown[] =[id, userId];
  let n = 2;

  if (patch.projectId !== undefined) {
    params.push(patch.projectId);
    n += 1;
    set.push(`project_id = $${n}`);
  }
  if (patch.category !== undefined) {
    params.push(patch.category);
    n += 1;
    set.push(`category = $${n}`);
  }
  if (patch.vendor !== undefined) {
    params.push(patch.vendor);
    n += 1;
    set.push(`vendor = $${n}`);
  }
  if (patch.description !== undefined) {
    params.push(patch.description);
    n += 1;
    set.push(`description = $${n}`);
  }
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
  if (patch.incurredOn !== undefined) {
    params.push(patch.incurredOn);
    n += 1;
    set.push(`incurred_on = $${n}`);
  }
  if (patch.paidOn !== undefined) {
    params.push(patch.paidOn);
    n += 1;
    set.push(`paid_on = $${n}`);
  }
  if (patch.receiptUrl !== undefined) {
    params.push(patch.receiptUrl);
    n += 1;
    set.push(`receipt_url = $${n}`);
  }
  if (patch.isReimbursable !== undefined) {
    params.push(patch.isReimbursable);
    n += 1;
    set.push(`is_reimbursable = $${n}`);
  }
  if (patch.tags !== undefined) {
    params.push(patch.tags);
    n += 1;
    set.push(`tags = $${n}::text[]`);
  }
  if (patch.metadata !== undefined) {
    params.push(JSON.stringify(patch.metadata));
    n += 1;
    set.push(`metadata = $${n}::jsonb`);
  }

  if (set.length === 0) {
    const current = await getExpense(id, userId);
    return current ? { kind: 'ok', expense: current } : { kind: 'not_found' };
  }

  set.push(`updated_at = now()`);

  const r = await pool.query(
    `UPDATE agos_business_expenses
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getExpense(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', expense: after };
}

// ─── Delete ───────────────────────────────────────────────────────────────

export type DeleteExpenseOutcome =
  | { kind: 'ok' }
  | { kind: 'not_found' };

export async function deleteExpense(
  id: string,
  userId: string,
): Promise<DeleteExpenseOutcome> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `DELETE FROM agos_business_expenses
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  return { kind: 'ok' };
}

// ─── Mark reimbursed ───────────────────────────────────────────────────────

export async function markReimbursed(
  id: string,
  userId: string,
): Promise<Expense | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `UPDATE agos_business_expenses
        SET reimbursed_at = now(),
            updated_at     = now()
      WHERE id = $1 AND user_id = $2
        AND is_reimbursable = true
        AND reimbursed_at IS NULL
      RETURNING id`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getExpense(id, userId);
}
