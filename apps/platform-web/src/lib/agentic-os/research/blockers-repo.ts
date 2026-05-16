/**
 * Research OS Phase 6 — Top Blockers feed DB repository.
 *
 * Workshop-wide query — joins milestones + dependencies to the experiments
 * table filtered by `user_id`. Per-row severity assignment runs in JS via
 * `milestoneBlockerSeverity` so the policy is unit-testable without
 * spinning up Postgres. Sort + limit clamp also run in JS.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import 'server-only';
import { getResearchPool } from './session';
import {
  rankBlockerItems,
  limitBlockerItems,
  milestoneBlockerSeverity,
  type BlockerItem,
  type BlockerSeverity,
} from './blockers';
import type { MilestoneStatus } from './milestones';

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toDateOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export interface ListTopBlockersOpts {
  limit?: number;
  /** Injected for testability — defaults to `new Date()`. */
  today?: Date;
}

/**
 * Compute the Top Blockers feed across ALL of a user's research experiments.
 *
 *   1. Milestones where:
 *        status = 'missed' OR
 *        status = 'blocked' OR
 *        (status = 'at_risk' AND (due_at IS NULL OR due_at <= today+7)) OR
 *        (due_at < today AND status != 'done')                  -- overdue
 *   2. Dependencies where status='open' AND kind='blocks'.
 *
 * Severity is assigned per-row via `milestoneBlockerSeverity` (high /
 * medium two-tier). Sort: severity DESC, dueAt ASC NULLS LAST, createdAt
 * ASC. Limit clamped to [0, 100], default 25.
 */
export async function listTopBlockers(
  userId: string,
  options: ListTopBlockersOpts = {},
): Promise<BlockerItem[]> {
  const pool = getResearchPool();
  const today = options.today ?? new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const cutoffIso = new Date(today.getTime() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const milestoneRows = await pool.query(
    `SELECT m.id, m.experiment_id, m.title, m.status, m.due_at,
            m.blocked_reason, m.created_at,
            e.title AS experiment_name
       FROM agos_research_experiment_milestones m
       JOIN agos_research_experiments e ON e.id = m.experiment_id
      WHERE e.user_id = $1
        AND m.status <> 'done'
        AND (
              m.status IN ('missed','blocked')
           OR (m.status = 'at_risk' AND (m.due_at IS NULL OR m.due_at <= $3::date))
           OR (m.due_at IS NOT NULL AND m.due_at < $2::date)
        )`,
    [userId, todayIso, cutoffIso],
  );

  const dependencyRows = await pool.query(
    `SELECT d.id, d.from_experiment_id, d.to_experiment_id, d.notes, d.created_at,
            e_from.title AS from_name, e_to.title AS to_name
       FROM agos_research_experiment_dependencies d
       JOIN agos_research_experiments e_from ON e_from.id = d.from_experiment_id
       JOIN agos_research_experiments e_to   ON e_to.id   = d.to_experiment_id
      WHERE d.user_id = $1
        AND d.status = 'open'
        AND d.kind   = 'blocks'
        AND e_from.user_id = $1
        AND e_to.user_id   = $1`,
    [userId],
  );

  const items: BlockerItem[] = [];

  type RawBlockerMilestoneRow = {
    id: string;
    experiment_id: string;
    title: string;
    status: string;
    due_at: Date | string | null;
    blocked_reason: string | null;
    created_at: Date | string;
    experiment_name: string | null;
  };
  for (const row of milestoneRows.rows as RawBlockerMilestoneRow[]) {
    const status = row.status as MilestoneStatus;
    const dueAt = toDateOrNull(row.due_at);
    const severity = milestoneBlockerSeverity(status, dueAt, todayIso, cutoffIso);
    if (severity == null) continue;
    items.push({
      kind: 'milestone',
      id: row.id,
      experimentId: row.experiment_id,
      experimentName: row.experiment_name ?? 'Untitled experiment',
      title: row.title,
      severity,
      dueAt,
      status,
      reason: row.blocked_reason ?? null,
      createdAt: toIso(row.created_at),
    });
  }

  type RawBlockerDependencyRow = {
    id: string;
    from_experiment_id: string;
    to_experiment_id: string;
    notes: string | null;
    created_at: Date | string;
    from_name: string | null;
    to_name: string | null;
  };
  for (const row of dependencyRows.rows as RawBlockerDependencyRow[]) {
    const severity: BlockerSeverity = 'medium';
    items.push({
      kind: 'dependency',
      id: row.id,
      experimentId: row.from_experiment_id,
      experimentName: row.from_name ?? 'Untitled experiment',
      title: `Blocked by ${row.to_name ?? 'another experiment'}`,
      severity,
      dueAt: null,
      status: 'open',
      reason: row.notes ?? null,
      createdAt: toIso(row.created_at),
    });
  }

  const ranked = rankBlockerItems(items);
  return limitBlockerItems(ranked, options.limit ?? 25);
}
