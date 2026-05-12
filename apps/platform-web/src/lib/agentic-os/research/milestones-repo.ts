/**
 * Research OS Phase 6 — Experiment milestone DB repository.
 *
 * Cross-ownership contract
 * ------------------------
 * `agos_research_experiment_milestones.experiment_id` is NOT a FK — per the
 * v0.1.30 platform contract. This repo enforces ownership at the SQL layer
 * by JOIN-ing every milestone-level lookup to `agos_research_experiments`
 * filtered by `user_id`. A milestone under another user's experiment is
 * invisible to this user (returns null on get/update/delete).
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getResearchPool } from './session';
import {
  MILESTONE_STATUS_VALUES,
  MILESTONE_PRIORITY_VALUES,
  type ExperimentMilestone,
  type MilestoneStatus,
  type MilestonePriority,
  type CreateMilestoneInput,
  type UpdateMilestoneInput,
  type ListMilestonesOpts,
} from './milestones';

// ─── Row hydration ─────────────────────────────────────────────────────────

const MILESTONE_COLUMNS = `id, experiment_id, user_id, title, due_at, status,
                           priority, is_blocker, blocked_reason, notes_md,
                           completed_at, metadata, created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

function toDateString(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  // Postgres returns DATE as YYYY-MM-DD already; trim any time portion defensively.
  return s.slice(0, 10);
}

function rowToMilestone(row: any): ExperimentMilestone {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    userId: row.user_id,
    title: row.title,
    dueAt: toDateString(row.due_at),
    status: row.status as MilestoneStatus,
    priority: row.priority as MilestonePriority,
    isBlocker: Boolean(row.is_blocker),
    blockedReason: row.blocked_reason ?? null,
    notesMd: row.notes_md ?? null,
    completedAt: toIsoOrNull(row.completed_at),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── Ownership probe ───────────────────────────────────────────────────────

/**
 * Returns true when the supplied `experimentId` belongs to `userId`, false
 * otherwise. Used as a pre-flight probe by the experiment-scoped routes.
 */
export async function isExperimentOwnedByUser(
  experimentId: string,
  userId: string,
): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT 1
       FROM agos_research_experiments
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [experimentId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── List ──────────────────────────────────────────────────────────────────

/**
 * List milestones for a single experiment. Ordered by due_at ASC NULLS LAST,
 * then created_at ASC. Caller must have validated `experimentId` ownership;
 * the cross-ownership JOIN is still applied as a belt-and-suspenders gate.
 */
export async function listMilestonesForExperiment(
  experimentId: string,
  userId: string,
  opts: ListMilestonesOpts = {},
): Promise<ExperimentMilestone[]> {
  const pool = getResearchPool();
  const params: any[] = [experimentId, userId];
  const where: string[] = [
    `m.experiment_id = $1`,
    `EXISTS (
       SELECT 1 FROM agos_research_experiments e
        WHERE e.id = m.experiment_id AND e.user_id = $2
     )`,
  ];

  if (opts.status) {
    if (!(MILESTONE_STATUS_VALUES as readonly string[]).includes(opts.status)) {
      throw new Error(`Invalid status filter: ${opts.status}`);
    }
    params.push(opts.status);
    where.push(`m.status = $${params.length}`);
  }
  if (opts.priority) {
    if (!(MILESTONE_PRIORITY_VALUES as readonly string[]).includes(opts.priority)) {
      throw new Error(`Invalid priority filter: ${opts.priority}`);
    }
    params.push(opts.priority);
    where.push(`m.priority = $${params.length}`);
  }
  if (opts.isBlocker !== undefined) {
    params.push(opts.isBlocker);
    where.push(`m.is_blocker = $${params.length}`);
  }

  const r = await pool.query(
    `SELECT ${MILESTONE_COLUMNS}
       FROM agos_research_experiment_milestones m
      WHERE ${where.join(' AND ')}
      ORDER BY m.due_at ASC NULLS LAST, m.created_at ASC`,
    params,
  );
  return r.rows.map(rowToMilestone);
}

// ─── Get one ───────────────────────────────────────────────────────────────

export async function getMilestone(
  id: string,
  userId: string,
): Promise<ExperimentMilestone | null> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT ${MILESTONE_COLUMNS}
       FROM agos_research_experiment_milestones m
      WHERE m.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = m.experiment_id AND e.user_id = $2
            )
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToMilestone(r.rows[0]);
}

// ─── Create ────────────────────────────────────────────────────────────────

export async function createMilestone(
  experimentId: string,
  userId: string,
  data: CreateMilestoneInput,
): Promise<ExperimentMilestone> {
  if (
    data.status !== undefined &&
    !(MILESTONE_STATUS_VALUES as readonly string[]).includes(data.status)
  ) {
    throw new Error(`Invalid status: ${data.status}`);
  }
  if (
    data.priority !== undefined &&
    !(MILESTONE_PRIORITY_VALUES as readonly string[]).includes(data.priority)
  ) {
    throw new Error(`Invalid priority: ${data.priority}`);
  }

  const pool = getResearchPool();
  const id = randomUUID();
  // completed_at auto-stamps when created with status='done'.
  const status: MilestoneStatus = data.status ?? 'pending';
  const completedAtClause = status === 'done' ? `now()` : `NULL`;

  await pool.query(
    `INSERT INTO agos_research_experiment_milestones
       (id, experiment_id, user_id, title, due_at, status, priority,
        is_blocker, blocked_reason, notes_md, metadata, completed_at)
     VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11::jsonb, ${completedAtClause})`,
    [
      id,
      experimentId,
      userId,
      data.title,
      data.dueAt ?? null,
      status,
      data.priority ?? 'medium',
      data.isBlocker ?? false,
      data.blockedReason ?? null,
      data.notesMd ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  const created = await getMilestone(id, userId);
  if (!created) throw new Error('Failed to create milestone');
  return created;
}

// ─── Update ────────────────────────────────────────────────────────────────

/**
 * Partial update. Cross-ownership enforced via JOIN; rows belonging to
 * another user return null. Setting status='done' auto-stamps completed_at
 * to now() if null; setting status to any non-done value clears
 * completed_at back to null.
 */
export async function updateMilestone(
  id: string,
  userId: string,
  patch: UpdateMilestoneInput,
): Promise<ExperimentMilestone | null> {
  if (
    patch.status !== undefined &&
    !(MILESTONE_STATUS_VALUES as readonly string[]).includes(patch.status)
  ) {
    throw new Error(`Invalid status: ${patch.status}`);
  }
  if (
    patch.priority !== undefined &&
    !(MILESTONE_PRIORITY_VALUES as readonly string[]).includes(patch.priority)
  ) {
    throw new Error(`Invalid priority: ${patch.priority}`);
  }

  const pool = getResearchPool();
  const r = await pool.query(
    `UPDATE agos_research_experiment_milestones m
        SET title          = COALESCE($3, title),
            due_at         = CASE WHEN $4::boolean THEN $5::date ELSE due_at END,
            status         = COALESCE($6, status),
            priority       = COALESCE($7, priority),
            is_blocker     = COALESCE($8, is_blocker),
            blocked_reason = CASE WHEN $9::boolean THEN $10 ELSE blocked_reason END,
            notes_md       = CASE WHEN $11::boolean THEN $12 ELSE notes_md END,
            metadata       = COALESCE($13::jsonb, metadata),
            completed_at   = CASE
                               WHEN $6 = 'done' AND completed_at IS NULL THEN now()
                               WHEN $6 IS NOT NULL AND $6 <> 'done' THEN NULL
                               ELSE completed_at
                             END,
            updated_at     = now()
      WHERE m.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = m.experiment_id AND e.user_id = $2
            )
      RETURNING m.id`,
    [
      id,
      userId,
      patch.title ?? null,
      patch.dueAt !== undefined,
      patch.dueAt ?? null,
      patch.status ?? null,
      patch.priority ?? null,
      patch.isBlocker ?? null,
      patch.blockedReason !== undefined,
      patch.blockedReason ?? null,
      patch.notesMd !== undefined,
      patch.notesMd ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );

  if ((r.rowCount ?? 0) === 0) return null;
  return getMilestone(id, userId);
}

// ─── Delete ────────────────────────────────────────────────────────────────

export async function deleteMilestone(id: string, userId: string): Promise<boolean> {
  const pool = getResearchPool();
  const r = await pool.query(
    `DELETE FROM agos_research_experiment_milestones m
      WHERE m.id = $1
        AND EXISTS (
              SELECT 1 FROM agos_research_experiments e
               WHERE e.id = m.experiment_id AND e.user_id = $2
            )`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}
