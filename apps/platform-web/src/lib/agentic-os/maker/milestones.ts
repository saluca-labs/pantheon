/**
 * Maker OS — Build-milestone domain types and pure helpers.
 *
 * A milestone is a named beat in the project timeline — "frame welded", "PCB
 * stuffed", "first power-on". Each carries an optional due date and an
 * optional completion timestamp. The milestone strip on the project hub
 * renders them in a Gantt-like horizontal layout ordered by due date (with
 * `sort_order` as the tiebreaker when due dates collide or are NULL).
 *
 * No database calls here — those live in `repo.ts`.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

// ─── Build-milestone entity ────────────────────────────────────────────────

export interface BuildMilestone {
  id: string;
  projectId: string;
  label: string;
  /** YYYY-MM-DD calendar date or null. */
  dueAt: string | null;
  completedAt: string | null;
  sortOrder: number;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BuildMilestoneUpsert {
  label: string;
  dueAt?: string | null;
  sortOrder?: number;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export type BuildMilestonePatch = Partial<BuildMilestoneUpsert>;

// ─── Pure helpers ──────────────────────────────────────────────────────────

/**
 * Status pill values — derived from completedAt + dueAt rather than stored.
 *
 *   done     — completedAt != null
 *   overdue  — !done && dueAt < today
 *   due_soon — !done && 0 <= (dueAt - today) <= 7 days
 *   upcoming — !done && dueAt > today + 7 days
 *   undated  — !done && dueAt == null
 */
export const MILESTONE_STATUS_VALUES = [
  'done',
  'overdue',
  'due_soon',
  'upcoming',
  'undated',
] as const;

export type MilestoneStatus = (typeof MILESTONE_STATUS_VALUES)[number];

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  done: 'Done',
  overdue: 'Overdue',
  due_soon: 'Due soon',
  upcoming: 'Upcoming',
  undated: 'Undated',
};

/**
 * Derive the status pill for a single milestone given "today" as a calendar
 * date. The `today` parameter is injected so tests and SSR can produce
 * deterministic output without leaking on system clock.
 */
export function milestoneStatus(
  milestone: Pick<BuildMilestone, 'completedAt' | 'dueAt'>,
  today: Date = new Date(),
): MilestoneStatus {
  if (milestone.completedAt != null) return 'done';
  if (!milestone.dueAt) return 'undated';

  const dueMs = Date.parse(`${milestone.dueAt}T00:00:00Z`);
  if (!Number.isFinite(dueMs)) return 'undated';

  const todayStart = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const diffDays = Math.round((dueMs - todayStart) / 86_400_000);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 7) return 'due_soon';
  return 'upcoming';
}

/**
 * Sort milestones into the order the strip displays them:
 *
 *   1. Due-dated milestones first, by dueAt ASC.
 *   2. Within the same dueAt, by sortOrder ASC.
 *   3. Undated (dueAt == null) milestones last, by sortOrder ASC then
 *      createdAt ASC for stability.
 *
 * Pure — no I/O. Returns a new array.
 */
export function sortMilestones(milestones: BuildMilestone[]): BuildMilestone[] {
  return [...milestones].sort((a, b) => {
    const aHas = a.dueAt != null;
    const bHas = b.dueAt != null;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    if (aHas && bHas) {
      if (a.dueAt! < b.dueAt!) return -1;
      if (a.dueAt! > b.dueAt!) return 1;
    }
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;
    return 0;
  });
}

/**
 * Aggregate completion + risk stats for the milestone strip footer.
 */
export interface MilestoneStats {
  total: number;
  done: number;
  overdue: number;
  dueSoon: number;
}

export function summarizeMilestones(
  milestones: BuildMilestone[],
  today: Date = new Date(),
): MilestoneStats {
  let done = 0;
  let overdue = 0;
  let dueSoon = 0;
  for (const m of milestones) {
    const status = milestoneStatus(m, today);
    if (status === 'done') done += 1;
    else if (status === 'overdue') overdue += 1;
    else if (status === 'due_soon') dueSoon += 1;
  }
  return { total: milestones.length, done, overdue, dueSoon };
}

// ─── Validators ───────────────────────────────────────────────────────────

/**
 * Validate a milestone label — non-empty, max 200 characters.
 */
export function validateMilestoneLabel(value: unknown): string | null {
  if (typeof value !== 'string') return 'label must be a string.';
  const trimmed = value.trim();
  if (!trimmed) return 'label is required.';
  if (trimmed.length > 200) return 'label must be at most 200 characters.';
  return null;
}

/**
 * Validate a due_at value — must be either null or a YYYY-MM-DD calendar
 * date that parses to a real day. Returns an error string or null.
 */
export function validateDueAt(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return 'dueAt must be a YYYY-MM-DD string or null.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'dueAt must match YYYY-MM-DD.';
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return 'dueAt is not a real calendar date.';
  return null;
}

/**
 * Validate a sort_order — must be a finite integer (positive, negative, or
 * zero — the column has no constraint beyond INT range).
 */
export function validateSortOrder(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'sortOrder must be a number.';
  }
  if (!Number.isInteger(value)) return 'sortOrder must be an integer.';
  return null;
}
