/**
 * Maker OS — Build-milestone domain types and pure helpers.
 *
 * A milestone is a named beat in the project timeline — "frame welded", "PCB
 * stuffed", "first power-on". Each carries an optional due date and an
 * optional completion timestamp. The milestone strip on the project hub
 * renders them in a Gantt-like horizontal layout ordered by due date (with
 * `sort_order` as the tiebreaker when due dates collide or are NULL).
 *
 * Phase 6 promotes milestones into deadlines: explicit `status`, `priority`,
 * `isBlocker`, and `blockedReason` columns lift the milestone strip into a
 * cross-project Top Blockers feed. The derived status helper
 * (`derivedMilestoneStatus`) remains for the legacy Gantt strip; the new
 * stored `status` column is used by the deadline view and blockers query.
 *
 * No database calls here — those live in `repo.ts`.
 *
 * @license MIT — Tiresias Maker OS Phase 3 + Phase 6 (internal).
 */

// ─── Build-milestone entity ────────────────────────────────────────────────

/**
 * Phase 6 status taxonomy — stored on the row. CHECK in the DB matches.
 *
 *   pending  — fresh milestone, nothing started.
 *   at_risk  — author flagged the milestone as in danger of slipping.
 *   blocked  — milestone is actively blocked (see blockedReason).
 *   on_track — author affirms progress against the due date.
 *   done     — completed; the legacy completed_at timestamp is set too.
 *   missed   — author acknowledges the milestone slipped past its due date.
 */
export const MILESTONE_STORED_STATUS_VALUES = [
  'pending',
  'at_risk',
  'blocked',
  'on_track',
  'done',
  'missed',
] as const;

export type MilestoneStoredStatus = (typeof MILESTONE_STORED_STATUS_VALUES)[number];

export const MILESTONE_STORED_STATUS_LABELS: Record<MilestoneStoredStatus, string> = {
  pending: 'Pending',
  at_risk: 'At risk',
  blocked: 'Blocked',
  on_track: 'On track',
  done: 'Done',
  missed: 'Missed',
};

export const MILESTONE_PRIORITY_VALUES = ['low', 'medium', 'high', 'critical'] as const;
export type MilestonePriority = (typeof MILESTONE_PRIORITY_VALUES)[number];

export const MILESTONE_PRIORITY_LABELS: Record<MilestonePriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export interface BuildMilestone {
  id: string;
  projectId: string;
  label: string;
  /** YYYY-MM-DD calendar date or null. */
  dueAt: string | null;
  completedAt: string | null;
  sortOrder: number;
  notes: string | null;
  /** Phase 6 — stored status. */
  status: MilestoneStoredStatus;
  /** Phase 6 — priority pill. */
  priority: MilestonePriority;
  /** Phase 6 — flag the milestone as a hard blocker. */
  isBlocker: boolean;
  /** Phase 6 — explanation for at_risk / blocked / missed / is_blocker. */
  blockedReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BuildMilestoneUpsert {
  label: string;
  dueAt?: string | null;
  sortOrder?: number;
  notes?: string | null;
  status?: MilestoneStoredStatus;
  priority?: MilestonePriority;
  isBlocker?: boolean;
  blockedReason?: string | null;
  metadata?: Record<string, unknown>;
}

export type BuildMilestonePatch = Partial<BuildMilestoneUpsert>;

// ─── Pure helpers ──────────────────────────────────────────────────────────

/**
 * Derived (legacy) status pill values — computed from completedAt + dueAt
 * rather than stored. Used by the Phase 3 milestone strip; the deadline
 * view and Top Blockers feed use the stored `status` column.
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

export function validateMilestoneStatus(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(MILESTONE_STORED_STATUS_VALUES as readonly string[]).includes(value)
  ) {
    return `status must be one of: ${MILESTONE_STORED_STATUS_VALUES.join(', ')}.`;
  }
  return null;
}

export function validateMilestonePriority(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(MILESTONE_PRIORITY_VALUES as readonly string[]).includes(value)
  ) {
    return `priority must be one of: ${MILESTONE_PRIORITY_VALUES.join(', ')}.`;
  }
  return null;
}

// ─── Phase 6 deadline / blocker helpers ───────────────────────────────────

/**
 * Sort milestones for the deadline view: dated rows first by dueAt ASC,
 * then undated by sortOrder ASC then createdAt ASC. This is the same shape
 * as `sortMilestones` but exported as a deadline-specific alias for
 * readability at the call site.
 */
export const sortMilestonesByDeadline = sortMilestones;

/**
 * Severity score order — used by the Top Blockers feed ranking:
 *
 *   missed              → 5
 *   blocked             → 4
 *   overdue (derived)   → 3
 *   at_risk             → 2
 *   open_dependency     → 1
 *
 * Higher value = ranks first.
 */
export const SEVERITY_SCORES = {
  missed: 5,
  blocked: 4,
  overdue: 3,
  at_risk: 2,
  open_dependency: 1,
} as const;

export type SeverityKind = keyof typeof SEVERITY_SCORES;

/**
 * Determine which severity bucket a milestone falls into for the Top
 * Blockers feed. Returns null if the milestone does not qualify as a
 * blocker under the v1 rules.
 *
 * Rules (highest first wins):
 *   * status = 'missed'                                       → missed
 *   * status = 'blocked'                                      → blocked
 *   * dueAt < today AND status != 'done'                      → overdue
 *   * status = 'at_risk' AND dueAt <= today + 7 days          → at_risk
 *   * else                                                    → null
 */
export function milestoneSeverity(
  milestone: Pick<BuildMilestone, 'status' | 'dueAt' | 'completedAt'>,
  today: Date = new Date(),
): SeverityKind | null {
  if (milestone.status === 'done') return null;
  if (milestone.status === 'missed') return 'missed';
  if (milestone.status === 'blocked') return 'blocked';

  if (milestone.dueAt) {
    const dueMs = Date.parse(`${milestone.dueAt}T00:00:00Z`);
    if (Number.isFinite(dueMs)) {
      const todayStart = Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
      );
      const diffDays = Math.round((dueMs - todayStart) / 86_400_000);
      if (diffDays < 0) return 'overdue';
      if (milestone.status === 'at_risk' && diffDays <= 7) return 'at_risk';
    }
  } else if (milestone.status === 'at_risk') {
    // Undated at_risk milestones still qualify (lowest of the at_risk tier).
    return 'at_risk';
  }

  return null;
}
