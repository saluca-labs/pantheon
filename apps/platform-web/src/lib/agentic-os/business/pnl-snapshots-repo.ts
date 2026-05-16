/**
 * Business OS Phase 5 — P&L snapshots DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. A snapshot id belonging to another user returns null on get /
 * update / delete.
 *
 * `computePnlSummary` is the core function — cash-basis revenue from
 * payments + expenses using COALESCE(paid_on, incurred_on). Supports
 * grouping by month, project, or category.
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import {
  PERIOD_KINDS,
  type PnlSnapshot,
  type PeriodKind,
  type CreatePnlSnapshotInput,
  type UpdatePnlSnapshotInput,
  type PnlSnapshotsListOpts,
  type PnlSummaryCurrency,
  type PnlSummaryGroup,
} from './pnl-snapshots';

const SNAPSHOT_COLUMNS = `id, user_id, period_kind, period_start, period_end,
                             revenue_cents, expense_cents, margin_cents,
                             currency, is_locked, notes, created_at`;

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

function toBoolean(v: unknown): boolean {
  return Boolean(v);
}

interface RawPnlSnapshotRow {
  id: string;
  user_id: string;
  period_kind: string;
  period_start: Date | string | null;
  period_end: Date | string | null;
  revenue_cents: number | string | null;
  expense_cents: number | string | null;
  margin_cents: number | string | null;
  currency: string | null;
  is_locked: boolean;
  notes: string | null;
  created_at: Date | string;
}

function rowToSnapshot(row: RawPnlSnapshotRow): PnlSnapshot {
  return {
    id: row.id,
    userId: row.user_id,
    periodKind: row.period_kind as PeriodKind,
    periodStart: parseDateOrNull(row.period_start) ?? '',
    periodEnd: parseDateOrNull(row.period_end) ?? '',
    revenueCents: Number(row.revenue_cents ?? 0),
    expenseCents: Number(row.expense_cents ?? 0),
    marginCents: Number(row.margin_cents ?? 0),
    currency: row.currency ?? 'USD',
    isLocked: toBoolean(row.is_locked),
    notes: row.notes ?? null,
    createdAt: toIso(row.created_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listSnapshots(
  userId: string,
  opts: PnlSnapshotsListOpts = {},
): Promise<PnlSnapshot[]> {
  const pool = getBusinessPool();
  const params: unknown[] =[userId];
  const where: string[] = [`user_id = $1`];

  if (opts.periodKind) {
    params.push(opts.periodKind);
    where.push(`period_kind = $${params.length}`);
  }

  if (opts.locked !== undefined) {
    if (opts.locked) {
      where.push(`is_locked = true`);
    } else {
      where.push(`is_locked = false`);
    }
  }

  if (opts.from) {
    params.push(opts.from);
    where.push(`period_start >= $${params.length}::date`);
  }

  if (opts.to) {
    params.push(opts.to);
    where.push(`period_start <= $${params.length}::date`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${SNAPSHOT_COLUMNS}
       FROM agos_business_pnl_snapshots
      WHERE ${where.join(' AND ')}
      ORDER BY period_start DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToSnapshot);
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getSnapshot(
  id: string,
  userId: string,
): Promise<PnlSnapshot | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${SNAPSHOT_COLUMNS}
       FROM agos_business_pnl_snapshots
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSnapshot(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────

export type CreateSnapshotOutcome =
  | { kind: 'ok'; snapshot: PnlSnapshot }
  | { kind: 'duplicate'; existing: PnlSnapshot };

export async function createSnapshot(
  userId: string,
  data: CreatePnlSnapshotInput,
): Promise<CreateSnapshotOutcome> {
  const pool = getBusinessPool();
  const id = randomUUID();

  const margin =
    data.marginCents !== undefined
      ? data.marginCents
      : data.revenueCents - data.expenseCents;

  try {
    await pool.query(
      `INSERT INTO agos_business_pnl_snapshots
         (id, user_id, period_kind, period_start, period_end,
          revenue_cents, expense_cents, margin_cents, currency, is_locked, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        userId,
        data.periodKind,
        data.periodStart,
        data.periodEnd,
        data.revenueCents,
        data.expenseCents,
        margin,
        data.currency,
        data.isLocked ?? false,
        data.notes ?? null,
      ],
    );
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    // PostgreSQL unique violation code
    if (errErr.code === '23505') {
      // Fetch the existing snapshot to return it
      const r = await pool.query(
        `SELECT ${SNAPSHOT_COLUMNS}
           FROM agos_business_pnl_snapshots
          WHERE user_id = $1
            AND period_kind = $2
            AND period_start = $3
          LIMIT 1`,
        [userId, data.periodKind, data.periodStart],
      );
      if (r.rows.length > 0) {
        return { kind: 'duplicate', existing: rowToSnapshot(r.rows[0]) };
      }
      // Fallback: just re-throw if we somehow can't find it
    }
    throw err;
  }

  const after = await getSnapshot(id, userId);
  if (!after) throw new Error('Failed to create P&L snapshot');
  return { kind: 'ok', snapshot: after };
}

// ─── Update ───────────────────────────────────────────────────────────────

export type UpdateSnapshotOutcome =
  | { kind: 'ok'; snapshot: PnlSnapshot }
  | { kind: 'not_found' }
  | { kind: 'locked'; reason: string };

export async function updateSnapshot(
  id: string,
  userId: string,
  patch: UpdatePnlSnapshotInput,
): Promise<UpdateSnapshotOutcome> {
  const before = await getSnapshot(id, userId);
  if (!before) return { kind: 'not_found' };
  if (before.isLocked) {
    return { kind: 'locked', reason: 'Snapshot is locked and cannot be updated' };
  }

  const pool = getBusinessPool();
  const set: string[] = [];
  const params: unknown[] =[id, userId];
  let n = 2;

  if (patch.isLocked !== undefined) {
    params.push(patch.isLocked);
    n += 1;
    set.push(`is_locked = $${n}`);
  }
  if (patch.notes !== undefined) {
    params.push(patch.notes);
    n += 1;
    set.push(`notes = $${n}`);
  }

  if (set.length === 0) {
    return { kind: 'ok', snapshot: before };
  }

  const r = await pool.query(
    `UPDATE agos_business_pnl_snapshots
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getSnapshot(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', snapshot: after };
}

// ─── Delete ───────────────────────────────────────────────────────────────

export type DeleteSnapshotOutcome =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'locked'; reason: string };

export async function deleteSnapshot(
  id: string,
  userId: string,
): Promise<DeleteSnapshotOutcome> {
  const before = await getSnapshot(id, userId);
  if (!before) return { kind: 'not_found' };
  if (before.isLocked) {
    return { kind: 'locked', reason: 'Snapshot is locked and cannot be deleted' };
  }

  const pool = getBusinessPool();
  await pool.query(
    `DELETE FROM agos_business_pnl_snapshots
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return { kind: 'ok' };
}

// ─── Compute P&L summary (core function) ──────────────────────────────────

export type PnlGroupBy = 'month' | 'project' | 'category';

export async function computePnlSummary(
  userId: string,
  periodStart: string,
  periodEnd: string,
  groupBy?: PnlGroupBy,
): Promise<{
  summary: PnlSummaryCurrency[];
  groups: PnlSummaryGroup[];
}> {
  const pool = getBusinessPool();

  // ── Revenue: cash-basis from payments received within the period ──
  const revBy = groupBy === 'month'
    ? `to_char(p.received_on, 'YYYY-MM')`
    : groupBy === 'project'
      ? `COALESCE(i.project_id::text, '_unlinked')`
      : groupBy === 'category'
        ? `'_all'`
        : `'_all'`;

  const revJoin = groupBy === 'project'
    ? `LEFT JOIN agos_business_invoices i ON i.id = p.invoice_id`
    : ``;

  const revGroupBy = groupBy && groupBy !== 'category'
    ? `GROUP BY p.currency, group_label`
    : `GROUP BY p.currency`;

  let revSql: string;
  if (groupBy === 'project') {
    revSql = `
      SELECT
        p.currency AS currency,
        ${revBy} AS group_label,
        COALESCE(SUM(p.amount_cents), 0) AS revenue_cents
      FROM agos_business_payments p
      ${revJoin}
      WHERE p.user_id = $1
        AND p.received_on >= $2::date
        AND p.received_on <= $3::date
      ${revGroupBy}
      ORDER BY currency, group_label`;
  } else if (groupBy === 'month') {
    revSql = `
      SELECT
        p.currency AS currency,
        ${revBy} AS group_label,
        COALESCE(SUM(p.amount_cents), 0) AS revenue_cents
      FROM agos_business_payments p
      WHERE p.user_id = $1
        AND p.received_on >= $2::date
        AND p.received_on <= $3::date
      ${revGroupBy}
      ORDER BY currency, group_label`;
  } else {
    revSql = `
      SELECT
        p.currency AS currency,
        '_all' AS group_label,
        COALESCE(SUM(p.amount_cents), 0) AS revenue_cents
      FROM agos_business_payments p
      WHERE p.user_id = $1
        AND p.received_on >= $2::date
        AND p.received_on <= $3::date
      ${revGroupBy}
      ORDER BY currency`;
  }

  // ── Expenses: cash-basis using COALESCE(paid_on, incurred_on) ──
  const expBy = groupBy === 'month'
    ? `to_char(COALESCE(e.paid_on, e.incurred_on), 'YYYY-MM')`
    : groupBy === 'project'
      ? `COALESCE(e.project_id::text, '_unlinked')`
      : groupBy === 'category'
        ? `e.category`
        : `'_all'`;

  const expGroupBy = groupBy
    ? `GROUP BY e.currency, group_label`
    : `GROUP BY e.currency`;

  const expSql = `
    SELECT
      e.currency AS currency,
      ${expBy} AS group_label,
      COALESCE(SUM(e.amount_cents), 0) AS expense_cents
    FROM agos_business_expenses e
    WHERE e.user_id = $1
      AND COALESCE(e.paid_on, e.incurred_on) >= $2::date
      AND COALESCE(e.paid_on, e.incurred_on) <= $3::date
    ${expGroupBy}
    ORDER BY currency, group_label`;

  const [revR, expR] = await Promise.all([
    pool.query(revSql, [userId, periodStart, periodEnd]),
    pool.query(expSql, [userId, periodStart, periodEnd]),
  ]);

  // ── Combine into groups ──
  const revMap = new Map<string, Map<string, number>>();
  for (const row of revR.rows) {
    const currency = row.currency ?? 'USD';
    const label = row.group_label ?? '_all';
    const amount = Number(row.revenue_cents ?? 0);
    if (!revMap.has(currency)) revMap.set(currency, new Map());
    revMap.get(currency)!.set(label, amount);
  }

  const expMap = new Map<string, Map<string, number>>();
  for (const row of expR.rows) {
    const currency = row.currency ?? 'USD';
    const label = row.group_label ?? '_all';
    const amount = Number(row.expense_cents ?? 0);
    if (!expMap.has(currency)) expMap.set(currency, new Map());
    expMap.get(currency)!.set(label, amount);
  }

  // Build group list
  const allLabels = new Set<string>();
  for (const [, m] of revMap) for (const l of m.keys()) allLabels.add(l);
  for (const [, m] of expMap) for (const l of m.keys()) allLabels.add(l);

  const groups: PnlSummaryGroup[] = [];
  for (const label of [...allLabels].sort()) {
    const currencies = new Set<string>();
    for (const c of revMap.keys()) currencies.add(c);
    for (const c of expMap.keys()) currencies.add(c);

    const totals: PnlSummaryCurrency[] = [];
    for (const currency of [...currencies].sort()) {
      const rev = revMap.get(currency)?.get(label) ?? 0;
      const exp = expMap.get(currency)?.get(label) ?? 0;
      totals.push({
        currency,
        revenueCents: rev,
        expenseCents: exp,
        marginCents: rev - exp,
      });
    }

    if (totals.length > 0) {
      groups.push({ label, totals });
    }
  }

  // ── Global summary per currency ──
  const summary: PnlSummaryCurrency[] = [];
  const allCurrencies = new Set<string>();
  for (const c of revMap.keys()) allCurrencies.add(c);
  for (const c of expMap.keys()) allCurrencies.add(c);

  for (const currency of [...allCurrencies].sort()) {
    let totalRev = 0;
    let totalExp = 0;
    for (const [, amt] of revMap.get(currency) ?? new Map()) totalRev += amt;
    for (const [, amt] of expMap.get(currency) ?? new Map()) totalExp += amt;
    summary.push({
      currency,
      revenueCents: totalRev,
      expenseCents: totalExp,
      marginCents: totalRev - totalExp,
    });
  }

  return { summary, groups };
}
