/**
 * Business OS Phase 3 — time-entry domain types + pure helpers.
 *
 * DB calls live in `time-entries-repo.ts`.
 *
 * @license MIT — Tiresias Business OS Phase 3 (internal).
 */

// ─── Domain type ──────────────────────────────────────────────────────────

export interface TimeEntry {
  id: string;
  userId: string;
  taskId: string;
  projectId: string;
  description: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  isBillable: boolean;
  billingRateCents: number | null;
  billedAt: string | null;
  invoiceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Create / update inputs ───────────────────────────────────────────────

export interface CreateTimeEntryInput {
  taskId: string;
  projectId: string;
  description?: string;
  startedAt?: string;
  durationMinutes?: number | null;
  isBillable?: boolean;
  billingRateCents?: number | null;
  metadata?: Record<string, unknown>;
}

export interface StartTimerInput {
  taskId: string;
  projectId: string;
  description?: string;
  isBillable?: boolean;
  billingRateCents?: number | null;
  metadata?: Record<string, unknown>;
}

export type UpdateTimeEntryInput = Partial<{
  taskId: string;
  projectId: string;
  description: string;
  startedAt: string;
  durationMinutes: number | null;
  isBillable: boolean;
  billingRateCents: number | null;
  metadata: Record<string, unknown>;
}>;

// ─── List filter ──────────────────────────────────────────────────────────

export interface TimeEntriesListOpts {
  taskId?: string;
  projectId?: string;
  isBillable?: boolean;
  unbilled?: boolean;
  running?: boolean;
  startedAfter?: string;
  startedBefore?: string;
  limit?: number;
  offset?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Compute elapsed minutes from two ISO-8601 timestamps.  Returns `null`
 * if either endpoint is missing.
 */
export function computeDuration(
  startedAt: string | null,
  endedAt: string | null,
  durationMinutes: number | null,
): number | null {
  if (durationMinutes != null) return durationMinutes;
  if (!startedAt || !endedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (isNaN(start) || isNaN(end)) return null;
  if (end < start) return 0;
  return Math.round((end - start) / 60000);
}

/**
 * Compute the billable amount in cents for a time entry.  Returns `null`
 * if duration or rate is missing.
 */
export function computeBillableAmount(
  durationMinutes: number | null,
  billingRateCents: number | null,
): number | null {
  if (durationMinutes == null || billingRateCents == null) return null;
  return Math.round((durationMinutes / 60) * billingRateCents);
}
