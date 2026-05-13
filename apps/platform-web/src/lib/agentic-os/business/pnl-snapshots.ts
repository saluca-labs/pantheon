/**
 * Business OS Phase 5 — P&L snapshot domain types + pure helpers.
 *
 * DB calls live in `pnl-snapshots-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

// ─── Constants ────────────────────────────────────────────────────────────

export const PERIOD_KINDS = ['month', 'quarter', 'year', 'custom'] as const;

export type PeriodKind = (typeof PERIOD_KINDS)[number];

// ─── Domain type ──────────────────────────────────────────────────────────

export interface PnlSnapshot {
  id: string;
  userId: string;
  periodKind: PeriodKind;
  periodStart: string;
  periodEnd: string;
  revenueCents: number;
  expenseCents: number;
  marginCents: number;
  currency: string;
  isLocked: boolean;
  notes: string | null;
  createdAt: string;
}

// ─── Create / update inputs ───────────────────────────────────────────────

export interface CreatePnlSnapshotInput {
  periodKind: PeriodKind;
  periodStart: string;
  periodEnd: string;
  revenueCents: number;
  expenseCents: number;
  marginCents?: number;
  currency: string;
  isLocked?: boolean;
  notes?: string | null;
}

export type UpdatePnlSnapshotInput = Partial<{
  isLocked: boolean;
  notes: string | null;
}>;

// ─── List filter ──────────────────────────────────────────────────────────

export interface PnlSnapshotsListOpts {
  periodKind?: PeriodKind;
  locked?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

// ─── P&L summary (computed) ───────────────────────────────────────────────

export interface PnlSummaryCurrency {
  currency: string;
  revenueCents: number;
  expenseCents: number;
  marginCents: number;
}

export interface PnlSummaryGroup {
  label: string;
  totals: PnlSummaryCurrency[];
}

// ─── Validators ───────────────────────────────────────────────────────────

export function isValidPeriodKind(value: unknown): value is PeriodKind {
  return (
    typeof value === 'string' &&
    (PERIOD_KINDS as readonly string[]).includes(value)
  );
}

export function validatePeriodRange(
  periodStart: string,
  periodEnd: string,
): string | null {
  if (!periodStart || !periodEnd) return 'both period_start and period_end are required';
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (isNaN(start.getTime())) return 'invalid period_start date';
  if (isNaN(end.getTime())) return 'invalid period_end date';
  if (start > end) return 'period_start must be before or equal to period_end';
  return null;
}
