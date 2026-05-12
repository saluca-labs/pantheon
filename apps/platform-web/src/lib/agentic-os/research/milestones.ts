/**
 * Research OS Phase 6 — Experiment milestone domain types and pure helpers.
 *
 * A milestone is a named beat in the experiment timeline — "data collection
 * complete", "analysis frozen", "preprint posted". Each carries an optional
 * due date and an optional completion timestamp. Mirrors the Maker Phase 6
 * milestone taxonomy (same status / priority / blocker columns) but is a
 * brand-new table — Research never carried a Phase-3-style Gantt strip.
 *
 * No database calls here — those live in `milestones-repo.ts`.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

// ─── Stored status taxonomy ───────────────────────────────────────────────

/**
 * Phase 6 status taxonomy — stored on the row. CHECK in the DB matches.
 *
 *   pending  — fresh milestone, nothing started.
 *   at_risk  — author flagged the milestone as in danger of slipping.
 *   blocked  — milestone is actively blocked (see blockedReason).
 *   on_track — author affirms progress against the due date.
 *   done     — completed; completed_at is set in sync.
 *   missed   — author acknowledges the milestone slipped past its due date.
 */
export const MILESTONE_STATUS_VALUES = [
  'pending',
  'at_risk',
  'blocked',
  'on_track',
  'done',
  'missed',
] as const;

export type MilestoneStatus = (typeof MILESTONE_STATUS_VALUES)[number];

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
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

// ─── Entity ───────────────────────────────────────────────────────────────

export interface ExperimentMilestone {
  id: string;
  experimentId: string;
  userId: string;
  title: string;
  /** YYYY-MM-DD calendar date or null. */
  dueAt: string | null;
  status: MilestoneStatus;
  priority: MilestonePriority;
  isBlocker: boolean;
  blockedReason: string | null;
  notesMd: string | null;
  completedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMilestoneInput {
  title: string;
  dueAt?: string | null;
  status?: MilestoneStatus;
  priority?: MilestonePriority;
  isBlocker?: boolean;
  blockedReason?: string | null;
  notesMd?: string | null;
  metadata?: Record<string, unknown>;
}

export type UpdateMilestoneInput = Partial<CreateMilestoneInput>;

export interface ListMilestonesOpts {
  status?: MilestoneStatus;
  priority?: MilestonePriority;
  isBlocker?: boolean;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────

/**
 * Derived (display-only) status pill values for the deadline strip — computed
 * from completedAt + dueAt rather than stored. Used by the milestone strip
 * card. The stored `status` column drives the Top Blockers feed.
 *
 *   done     — completedAt != null
 *   overdue  — !done && dueAt < today
 *   due_soon — !done && 0 <= (dueAt - today) <= 7 days
 *   upcoming — !done && dueAt > today + 7 days
 *   undated  — !done && dueAt == null
 */
export const MILESTONE_DERIVED_STATUS_VALUES = [
  'done',
  'overdue',
  'due_soon',
  'upcoming',
  'undated',
] as const;

export type MilestoneDerivedStatus = (typeof MILESTONE_DERIVED_STATUS_VALUES)[number];

/**
 * Derive the display pill for a single milestone given "today" as a calendar
 * date. The `today` parameter is injected so tests and SSR can produce
 * deterministic output without leaking on system clock.
 */
export function milestoneDerivedStatus(
  milestone: Pick<ExperimentMilestone, 'completedAt' | 'dueAt'>,
  today: Date = new Date(),
): MilestoneDerivedStatus {
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
 * Sort milestones for the deadline strip: dated rows first by dueAt ASC,
 * undated last by createdAt ASC. Pure — returns a new array.
 */
export function sortMilestonesByDeadline(
  milestones: ExperimentMilestone[],
): ExperimentMilestone[] {
  return [...milestones].sort((a, b) => {
    const aHas = a.dueAt != null;
    const bHas = b.dueAt != null;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    if (aHas && bHas) {
      if (a.dueAt! < b.dueAt!) return -1;
      if (a.dueAt! > b.dueAt!) return 1;
    }
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;
    return 0;
  });
}

// ─── Validators ───────────────────────────────────────────────────────────

export function validateMilestoneTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'title must be a string.';
  const trimmed = value.trim();
  if (!trimmed) return 'title is required.';
  if (trimmed.length > 200) return 'title must be at most 200 characters.';
  return null;
}

export function validateMilestoneDueAt(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return 'dueAt must be a YYYY-MM-DD string or null.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'dueAt must match YYYY-MM-DD.';
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return 'dueAt is not a real calendar date.';
  return null;
}

export function validateMilestoneStatus(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(MILESTONE_STATUS_VALUES as readonly string[]).includes(value)
  ) {
    return `status must be one of: ${MILESTONE_STATUS_VALUES.join(', ')}.`;
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

export function asMilestoneStatus(value: unknown): MilestoneStatus | null {
  if (
    typeof value === 'string' &&
    (MILESTONE_STATUS_VALUES as readonly string[]).includes(value)
  ) {
    return value as MilestoneStatus;
  }
  return null;
}

export function asMilestonePriority(value: unknown): MilestonePriority | null {
  if (
    typeof value === 'string' &&
    (MILESTONE_PRIORITY_VALUES as readonly string[]).includes(value)
  ) {
    return value as MilestonePriority;
  }
  return null;
}
