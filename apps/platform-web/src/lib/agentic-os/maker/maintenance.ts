/**
 * Maker OS — Tool-maintenance domain types and pure helpers.
 *
 * A maintenance event is one entry in the timestamped log per tool: cleaned,
 * serviced, calibrated, repaired, inspected. Each event carries a cost,
 * optional vendor, free-form notes, and an optional `nextDueAt` so the UI
 * can surface a "due in N days" badge.
 *
 * No database calls here — those live in `repo.ts`.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

// ─── Event-kind taxonomy ──────────────────────────────────────────────────

export const MAINTENANCE_EVENT_KIND_VALUES = [
  'cleaned',
  'serviced',
  'calibrated',
  'repaired',
  'inspected',
] as const;

export type MaintenanceEventKind =
  (typeof MAINTENANCE_EVENT_KIND_VALUES)[number];

export const MAINTENANCE_EVENT_KIND_LABELS: Record<MaintenanceEventKind, string> = {
  cleaned: 'Cleaned',
  serviced: 'Serviced',
  calibrated: 'Calibrated',
  repaired: 'Repaired',
  inspected: 'Inspected',
};

// ─── Maintenance entity ───────────────────────────────────────────────────

export interface MaintenanceEvent {
  id: string;
  toolId: string;
  eventKind: MaintenanceEventKind;
  performedAt: string;
  costCents: number | null;
  currency: string;
  vendor: string | null;
  notes: string | null;
  nextDueAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface MaintenanceEventUpsert {
  eventKind: MaintenanceEventKind;
  performedAt?: string;
  costCents?: number | null;
  currency?: string;
  vendor?: string | null;
  notes?: string | null;
  nextDueAt?: string | null;
  metadata?: Record<string, unknown>;
}

export type MaintenanceEventPatch = Partial<MaintenanceEventUpsert>;

// ─── Validators ───────────────────────────────────────────────────────────

export function validateMaintenanceEventKind(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(MAINTENANCE_EVENT_KIND_VALUES as readonly string[]).includes(value)
  ) {
    return `event_kind must be one of: ${MAINTENANCE_EVENT_KIND_VALUES.join(', ')}.`;
  }
  return null;
}

/**
 * Validate cost in cents — must be either null or a finite non-negative
 * integer. Returns an error string or null.
 */
export function validateCostCents(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'costCents must be a number or null.';
  }
  if (value < 0) return 'costCents must be non-negative.';
  if (!Number.isInteger(value)) return 'costCents must be an integer.';
  return null;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────

/**
 * Compute days until next maintenance is due, relative to `today`. Returns
 * null when nextDueAt is missing or unparseable. Negative values mean the
 * event is overdue (the UI flips to red).
 *
 * `today` is injected so tests and SSR can produce deterministic output.
 */
export function daysUntilNextDue(
  event: Pick<MaintenanceEvent, 'nextDueAt'>,
  today: Date = new Date(),
): number | null {
  if (!event.nextDueAt) return null;
  const dueMs = Date.parse(event.nextDueAt);
  if (!Number.isFinite(dueMs)) return null;
  const todayStart = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.round((dueMs - todayStart) / 86_400_000);
}

/**
 * Sort maintenance events by performedAt DESC — newest first. Pure helper;
 * the DB query already orders this way but components with optimistic
 * client-side state still need a stable sort.
 */
export function sortMaintenanceEvents(
  events: MaintenanceEvent[],
): MaintenanceEvent[] {
  return [...events].sort((a, b) => {
    if (a.performedAt < b.performedAt) return 1;
    if (a.performedAt > b.performedAt) return -1;
    return 0;
  });
}

/**
 * Aggregate maintenance stats: total event count + cost rollup in cents.
 * Useful for the tool detail header strip.
 */
export interface MaintenanceStats {
  total: number;
  totalCostCents: number;
  currency: string;
  /** ISO timestamp of the most recent event, or null when empty. */
  lastPerformedAt: string | null;
  /** ISO timestamp of the soonest upcoming next_due_at, or null. */
  nextDueAt: string | null;
}

export function summarizeMaintenance(
  events: MaintenanceEvent[],
): MaintenanceStats {
  let totalCostCents = 0;
  let currency = 'USD';
  let lastPerformedAt: string | null = null;
  let nextDueAt: string | null = null;
  for (const e of events) {
    if (e.costCents != null && Number.isFinite(e.costCents)) {
      totalCostCents += e.costCents;
      currency = e.currency || currency;
    }
    if (lastPerformedAt == null || e.performedAt > lastPerformedAt) {
      lastPerformedAt = e.performedAt;
    }
    if (e.nextDueAt && (nextDueAt == null || e.nextDueAt < nextDueAt)) {
      nextDueAt = e.nextDueAt;
    }
  }
  return {
    total: events.length,
    totalCostCents,
    currency,
    lastPerformedAt,
    nextDueAt,
  };
}

/**
 * Format an integer cents value as a localized currency string. Pure helper
 * to keep route + component side aligned.
 */
export function formatCost(
  costCents: number | null,
  currency: string = 'USD',
): string {
  if (costCents == null || !Number.isFinite(costCents)) return '—';
  const dollars = costCents / 100;
  return `${currency} ${dollars.toFixed(2)}`;
}
