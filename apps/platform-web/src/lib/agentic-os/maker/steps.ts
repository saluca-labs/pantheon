/**
 * Maker OS — Build-step domain types and pure helpers.
 *
 * A build step is one entry in the ordered checklist of work a project needs.
 * Steps carry a title (required), free-form body (optional), estimated time
 * in minutes (optional), an optional `blocker_text` for surfacing things the
 * maker is stuck on, and a `completed_at` timestamp that drives the "done"
 * pill on the step row.
 *
 * Status is derived from `completed_at` + `blocker_text` rather than stored
 * as an enum; the derivation lives here so route handlers and components
 * share a single source of truth.
 *
 * No database calls here — those live in `repo.ts`.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

// ─── Status derivation ─────────────────────────────────────────────────────

export const STEP_STATUS_VALUES = ['pending', 'blocked', 'done'] as const;

export type StepStatus = (typeof STEP_STATUS_VALUES)[number];

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  pending: 'Pending',
  blocked: 'Blocked',
  done: 'Done',
};

// ─── Build-step entity ─────────────────────────────────────────────────────

export interface BuildStep {
  id: string;
  projectId: string;
  ordinal: number;
  title: string;
  body: string | null;
  estMinutes: number | null;
  completedAt: string | null;
  blockerText: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BuildStepUpsert {
  title: string;
  body?: string | null;
  estMinutes?: number | null;
  blockerText?: string | null;
  ordinal?: number;
  metadata?: Record<string, unknown>;
}

export type BuildStepPatch = Partial<BuildStepUpsert>;

// ─── Pure helpers ──────────────────────────────────────────────────────────

/**
 * A step is "complete" when its `completed_at` is non-null. The blocker
 * text does not affect completion — a step can be both completed and have
 * stale blocker notes attached (the UI clears the blocker on completion by
 * default but the data model does not enforce it).
 */
export function isStepComplete(step: Pick<BuildStep, 'completedAt'>): boolean {
  return step.completedAt != null;
}

/**
 * Derive a status pill from the persisted fields. Precedence is
 * done > blocked > pending. The data model stores completed_at + blocker
 * independently; the UI only ever displays one pill at a time.
 */
export function stepStatus(
  step: Pick<BuildStep, 'completedAt' | 'blockerText'>,
): StepStatus {
  if (step.completedAt != null) return 'done';
  if (step.blockerText && step.blockerText.trim().length > 0) return 'blocked';
  return 'pending';
}

/**
 * Sort steps by ordinal ASC. Pure helper — the DB query already orders, but
 * components that hold local optimistic state need a stable client-side sort.
 */
export function sortSteps(steps: BuildStep[]): BuildStep[] {
  return [...steps].sort((a, b) => a.ordinal - b.ordinal);
}

/**
 * Compute the next ordinal for an append-only insert. The repo's create
 * helper resolves this via `SELECT MAX(ordinal) + 1` at insert time; this
 * pure helper is used by the optimistic-add code path in the component.
 */
export function nextOrdinal(steps: BuildStep[]): number {
  let max = 0;
  for (const s of steps) {
    if (s.ordinal > max) max = s.ordinal;
  }
  return max + 1;
}

/**
 * Aggregate completion stats for a step list. Used by the project hub to
 * show "12 / 30 done" on the Steps tab strip.
 */
export interface StepStats {
  total: number;
  done: number;
  blocked: number;
  pending: number;
  totalEstMinutes: number;
  remainingEstMinutes: number;
}

export function summarizeSteps(steps: BuildStep[]): StepStats {
  let done = 0;
  let blocked = 0;
  let totalEst = 0;
  let remainingEst = 0;
  for (const s of steps) {
    const status = stepStatus(s);
    if (status === 'done') done += 1;
    else if (status === 'blocked') blocked += 1;
    if (s.estMinutes != null && Number.isFinite(s.estMinutes)) {
      totalEst += s.estMinutes;
      if (status !== 'done') remainingEst += s.estMinutes;
    }
  }
  return {
    total: steps.length,
    done,
    blocked,
    pending: Math.max(0, steps.length - done - blocked),
    totalEstMinutes: totalEst,
    remainingEstMinutes: remainingEst,
  };
}

// ─── Validators ───────────────────────────────────────────────────────────

/**
 * Validate a step title — non-empty, max 200 characters. Returns an error
 * string or null when valid.
 */
export function validateStepTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'title must be a string.';
  const trimmed = value.trim();
  if (!trimmed) return 'title is required.';
  if (trimmed.length > 200) return 'title must be at most 200 characters.';
  return null;
}

/**
 * Validate an estMinutes value — must be a finite non-negative integer (or
 * null). Returns an error string or null when valid.
 */
export function validateEstMinutes(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'estMinutes must be a number or null.';
  }
  if (value < 0) return 'estMinutes must be non-negative.';
  if (!Number.isInteger(value)) return 'estMinutes must be an integer.';
  return null;
}

/**
 * Validate an ordinal value — finite positive integer.
 */
export function validateOrdinal(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'ordinal must be a number.';
  }
  if (!Number.isInteger(value) || value < 1) {
    return 'ordinal must be a positive integer.';
  }
  return null;
}
