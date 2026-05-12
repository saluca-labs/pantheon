/**
 * Research OS Phase 6 — Top Blockers feed (workshop-wide).
 *
 * Two-tier severity recipe — spec-locked
 * --------------------------------------
 * Per the Phase 6 spec, the Research feed uses a 2-tier severity model
 * (high / medium) rather than Maker's 5-rank model. Locked rules:
 *
 *   - Milestones in `missed` / `blocked`               → high
 *   - Milestones `on_track` but `due_at < today`       → high   (overdue beats label)
 *   - Any other milestone status with `due_at < today` → high   (overdue beats label)
 *   - Milestones in `at_risk` with `due_at <= today+7` → medium
 *   - Open dependencies with kind='blocks'             → medium
 *
 * Items are sorted severity DESC, then `dueAt` ASC NULLS LAST, then
 * `createdAt` ASC for deterministic tie-break.
 *
 * This is a deliberate deviation from Maker's 5-rank severity (missed,
 * blocked, overdue, at_risk, open_dependency) — see the build-prompt
 * locked decision. The two-tier shape collapses Maker's top three into
 * `high` and the bottom two into `medium`; the secondary ordering by
 * dueAt preserves the within-bucket "oldest first" semantics.
 *
 * No DB calls here — those live in `blockers-repo.ts`.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import {
  type MilestoneStatus,
  MILESTONE_STATUS_LABELS,
} from './milestones';

// ─── Item taxonomy ────────────────────────────────────────────────────────

export const BLOCKER_ITEM_KINDS = ['milestone', 'dependency'] as const;
export type BlockerItemKind = (typeof BLOCKER_ITEM_KINDS)[number];

export const BLOCKER_SEVERITIES = ['high', 'medium'] as const;
export type BlockerSeverity = (typeof BLOCKER_SEVERITIES)[number];

export const BLOCKER_SEVERITY_RANK: Record<BlockerSeverity, number> = {
  high: 2,
  medium: 1,
};

export const BLOCKER_SEVERITY_LABELS: Record<BlockerSeverity, string> = {
  high: 'High',
  medium: 'Medium',
};

// ─── Item entity ──────────────────────────────────────────────────────────

export interface BlockerItem {
  /** Which feed family produced this row. */
  kind: BlockerItemKind;
  /** Row id — milestone id or dependency id depending on `kind`. */
  id: string;
  experimentId: string;
  experimentName: string;
  /** Display title — milestone title or "Blocked by <peer experiment>". */
  title: string;
  severity: BlockerSeverity;
  /** YYYY-MM-DD or null — only set for milestone items. */
  dueAt: string | null;
  /**
   * Free-form status descriptor: stored milestone status for milestones,
   * 'open' for dependencies.
   */
  status: string;
  /** Optional explanation (blocked_reason, notes). */
  reason: string | null;
  /** ISO timestamp — used as a tie-break for dependency items. */
  createdAt: string;
}

export interface BlockerFeedResponse {
  items: BlockerItem[];
  /** ISO timestamp the feed was computed at. */
  generatedAt: string;
}

// ─── Severity assignment ──────────────────────────────────────────────────

/**
 * Assign a severity bucket to a milestone row from the workshop-wide
 * Top Blockers SQL fan-out. Returns null if the milestone does not
 * qualify (the SQL filter should already exclude these, but this guard
 * keeps the function total).
 *
 * Inputs:
 *   status — stored milestone status
 *   dueAt — YYYY-MM-DD or null
 *   todayIso — YYYY-MM-DD (today, injected for testability)
 *   cutoffIso — YYYY-MM-DD (today + 7 days)
 */
export function milestoneBlockerSeverity(
  status: MilestoneStatus,
  dueAt: string | null,
  todayIso: string,
  cutoffIso: string,
): BlockerSeverity | null {
  if (status === 'done') return null;
  const overdue = dueAt != null && dueAt < todayIso;
  // Overdue beats label — high regardless of stored status.
  if (overdue) return 'high';
  if (status === 'missed' || status === 'blocked') return 'high';
  if (status === 'at_risk' && dueAt != null && dueAt <= cutoffIso) return 'medium';
  // Undated at_risk milestones still qualify at the medium tier — they are
  // explicitly author-flagged risk markers even without a date.
  if (status === 'at_risk' && dueAt == null) return 'medium';
  return null;
}

// ─── Ranking ──────────────────────────────────────────────────────────────

/**
 * Deterministic ranking — highest severity first, then dueAt ASC NULLS
 * LAST, then createdAt ASC. Ties break on id ascending as the final
 * fallback so the SSR snapshot is reproducible.
 *
 * Pure — returns a new array.
 */
export function rankBlockerItems(items: BlockerItem[]): BlockerItem[] {
  return [...items].sort((a, b) => {
    const rA = BLOCKER_SEVERITY_RANK[a.severity];
    const rB = BLOCKER_SEVERITY_RANK[b.severity];
    if (rA !== rB) return rB - rA;
    // Within bucket: dueAt ASC, NULLS LAST.
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
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}

/**
 * Clamp a limit to [0, 100]. Default 25.
 */
export function clampBlockerLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 25;
  return Math.max(0, Math.min(Math.floor(limit), 100));
}

/**
 * Truncate a ranked list to `limit` items. Default 25, capped at 100.
 */
export function limitBlockerItems(items: BlockerItem[], limit: number): BlockerItem[] {
  return items.slice(0, clampBlockerLimit(limit));
}

// Re-export milestone status labels for the UI rendering.
export { MILESTONE_STATUS_LABELS };
