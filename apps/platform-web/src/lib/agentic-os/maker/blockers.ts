/**
 * Maker OS — Top Blockers feed domain types + pure ranking helpers.
 *
 * The blockers feed unifies two kinds of work-in-flight that need attention:
 *
 *   - Milestone risk — milestones whose stored status is `missed` /
 *     `blocked` / `at_risk` (within 7 days), or whose due date has slipped
 *     past today without `status='done'` (derived `overdue`).
 *   - Open dependencies — edges in the project graph with
 *     `kind='blocks'` AND `status='open'`. We focus the v1 widget on hard
 *     blocks; soft/informs/consumes/related edges are visible on the
 *     project page Dependencies tab but do not surface here.
 *
 * Items are ranked by severity (highest first), then by oldest due date
 * (for milestones) or oldest created_at (for dependencies). Deterministic
 * tie-breakers keep the SSR snapshot stable across renders.
 *
 * No database calls here — those live in `repo.ts`. The SQL fan-out + the
 * per-row severity assignment use this module's `rankBlockerItems` and
 * `BLOCKER_SEVERITY_RANK` exports.
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
 */

// ─── Item taxonomy ────────────────────────────────────────────────────────

export const BLOCKER_ITEM_KINDS = ['milestone', 'dependency'] as const;
export type BlockerItemKind = (typeof BLOCKER_ITEM_KINDS)[number];

/**
 * Severity values — ordered highest-to-lowest. The rank assignment lives in
 * `BLOCKER_SEVERITY_RANK` and is locked at:
 *
 *   missed              → 5  (milestone)
 *   blocked             → 4  (milestone)
 *   overdue             → 3  (milestone — derived from due_at + status)
 *   at_risk             → 2  (milestone)
 *   open_dependency     → 1  (dependency)
 */
export const BLOCKER_SEVERITIES = [
  'missed',
  'blocked',
  'overdue',
  'at_risk',
  'open_dependency',
] as const;

export type BlockerSeverity = (typeof BLOCKER_SEVERITIES)[number];

export const BLOCKER_SEVERITY_RANK: Record<BlockerSeverity, number> = {
  missed: 5,
  blocked: 4,
  overdue: 3,
  at_risk: 2,
  open_dependency: 1,
};

export const BLOCKER_SEVERITY_LABELS: Record<BlockerSeverity, string> = {
  missed: 'Missed',
  blocked: 'Blocked',
  overdue: 'Overdue',
  at_risk: 'At risk',
  open_dependency: 'Open dependency',
};

// ─── Item entity ──────────────────────────────────────────────────────────

export interface BlockerItem {
  /** Which feed family produced this row. */
  kind: BlockerItemKind;
  /** Row id — milestone id or dependency id depending on `kind`. */
  id: string;
  projectId: string;
  projectName: string;
  /** Display title — milestone label or "→ <peer project name>". */
  title: string;
  severity: BlockerSeverity;
  /** YYYY-MM-DD or null — only set for milestone items. */
  dueAt: string | null;
  /** Stored milestone status, dependency kind, etc. Free-form. */
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

// ─── Ranking ──────────────────────────────────────────────────────────────

/**
 * Deterministic ranking — highest severity first, then oldest due_at
 * (ascending) for milestones, then oldest createdAt for dependencies and
 * undated milestones. Stable: ties break on id ascending as the final
 * fallback so the SSR snapshot is reproducible.
 *
 * Pure — returns a new array.
 */
export function rankBlockerItems(items: BlockerItem[]): BlockerItem[] {
  return [...items].sort((a, b) => {
    const rA = BLOCKER_SEVERITY_RANK[a.severity];
    const rB = BLOCKER_SEVERITY_RANK[b.severity];
    if (rA !== rB) return rB - rA;
    // Within the same severity bucket: milestones rank by dueAt ascending
    // (oldest first). Items without a dueAt fall through to createdAt
    // ascending. This produces a deterministic order.
    if (a.kind === 'milestone' && b.kind === 'milestone') {
      if (a.dueAt && b.dueAt) {
        if (a.dueAt < b.dueAt) return -1;
        if (a.dueAt > b.dueAt) return 1;
      } else if (a.dueAt && !b.dueAt) {
        return -1;
      } else if (!a.dueAt && b.dueAt) {
        return 1;
      }
    }
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}

/**
 * Truncate a ranked list to `limit` items. Default 25, capped at 100 per
 * the locked spec. Separated from `rankBlockerItems` so callers can rank
 * once and slice multiple times (the widget shows 5; the full page shows
 * 25-100).
 */
export function limitBlockerItems(items: BlockerItem[], limit: number): BlockerItem[] {
  const safe = Math.max(0, Math.min(limit, 100));
  return items.slice(0, safe);
}
