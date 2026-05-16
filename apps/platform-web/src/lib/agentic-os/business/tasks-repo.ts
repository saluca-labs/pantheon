/**
 * Business OS Phase 3 — tasks DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. A task id belonging to another user returns null on get /
 * update.
 *
 * @license MIT — Tiresias Business OS Phase 3 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import {
  TASK_STATUSES,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type CreateTaskInput,
  type UpdateTaskInput,
  type TasksListOpts,
} from './tasks';

const TASK_COLUMNS = `id, user_id, project_id, title, description_md,
                        status, priority, assignee_text, due_on,
                        completed_at, billing_rate_cents, is_billable,
                        position, tags, metadata, created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

function parseDateOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.slice(0, 10);
  return null;
}

interface RawTaskRow {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  description_md: string | null;
  status: string;
  priority: string;
  assignee_text: string | null;
  due_on: Date | string | null;
  completed_at: Date | string | null;
  billing_rate_cents: number | string | null;
  is_billable: boolean;
  position: number | string;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToTask(row: RawTaskRow): Task {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    title: row.title,
    descriptionMd: row.description_md ?? '',
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    assigneeText: row.assignee_text ?? null,
    dueOn: parseDateOrNull(row.due_on),
    completedAt: toIsoOrNull(row.completed_at),
    billingRateCents:
      row.billing_rate_cents != null ? Number(row.billing_rate_cents) : null,
    isBillable: Boolean(row.is_billable),
    position: Number(row.position ?? 0),
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listTasks(
  userId: string,
  opts: TasksListOpts,
): Promise<Task[]> {
  const pool = getBusinessPool();
  const params: unknown[] =[userId, opts.projectId];
  const where: string[] = [`user_id = $1`, `project_id = $2`];

  if (opts.status) {
    params.push(opts.status);
    where.push(`status = $${params.length}`);
  }

  if (opts.priority) {
    params.push(opts.priority);
    where.push(`priority = $${params.length}`);
  }

  if (opts.dueBefore) {
    params.push(opts.dueBefore);
    where.push(`due_on <= $${params.length}`);
  }

  if (opts.dueAfter) {
    params.push(opts.dueAfter);
    where.push(`due_on >= $${params.length}`);
  }

  if (opts.isBillable !== undefined) {
    params.push(opts.isBillable);
    where.push(`is_billable = $${params.length}`);
  }

  if (opts.assigneeText && opts.assigneeText.trim()) {
    params.push(opts.assigneeText.trim().toLowerCase());
    where.push(`LOWER(COALESCE(assignee_text, '')) = $${params.length}`);
  }

  if (opts.tag && opts.tag.trim()) {
    params.push(opts.tag.trim().toLowerCase());
    where.push(`$${params.length} = ANY(tags)`);
  }

  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    where.push(
      `(LOWER(title) LIKE $${params.length}
        OR LOWER(COALESCE(description_md, '')) LIKE $${params.length})`,
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${TASK_COLUMNS}
       FROM agos_business_tasks
      WHERE ${where.join(' AND ')}
      ORDER BY position ASC, updated_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToTask);
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getTask(
  id: string,
  userId: string,
): Promise<Task | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${TASK_COLUMNS}
       FROM agos_business_tasks
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToTask(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createTask(
  userId: string,
  data: CreateTaskInput,
): Promise<Task> {
  const pool = getBusinessPool();
  const id = randomUUID();

  // Auto-position: one past the current max for this project
  let position = data.position ?? 0;
  if (data.position === undefined) {
    const maxR = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
         FROM agos_business_tasks
        WHERE project_id = $1 AND user_id = $2`,
      [data.projectId, userId],
    );
    position = Number(maxR.rows[0]?.next_pos ?? 0);
  }

  await pool.query(
    `INSERT INTO agos_business_tasks
       (id, user_id, project_id, title, description_md, status, priority,
        assignee_text, due_on, billing_rate_cents, is_billable, position,
        tags, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::text[],$14::jsonb)`,
    [
      id,
      userId,
      data.projectId,
      data.title,
      data.descriptionMd ?? '',
      data.status ?? 'todo',
      data.priority ?? 'medium',
      data.assigneeText ?? null,
      data.dueOn ?? null,
      data.billingRateCents ?? null,
      data.isBillable ?? true,
      position,
      data.tags ?? [],
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const after = await getTask(id, userId);
  if (!after) throw new Error('Failed to create task');
  return after;
}

// ─── Update ───────────────────────────────────────────────────────────────

export type UpdateTaskOutcome =
  | { kind: 'ok'; task: Task }
  | { kind: 'not_found' };

export async function updateTask(
  id: string,
  userId: string,
  patch: UpdateTaskInput,
): Promise<UpdateTaskOutcome> {
  const pool = getBusinessPool();
  const set: string[] = [];
  const params: unknown[] =[id, userId];
  let n = 2;

  if (patch.title !== undefined) {
    params.push(patch.title);
    n += 1;
    set.push(`title = $${n}`);
  }
  if (patch.projectId !== undefined) {
    params.push(patch.projectId);
    n += 1;
    set.push(`project_id = $${n}`);
  }
  if (patch.descriptionMd !== undefined) {
    params.push(patch.descriptionMd);
    n += 1;
    set.push(`description_md = $${n}`);
  }
  if (patch.priority !== undefined) {
    params.push(patch.priority);
    n += 1;
    set.push(`priority = $${n}`);
  }
  if (patch.assigneeText !== undefined) {
    params.push(patch.assigneeText);
    n += 1;
    set.push(`assignee_text = $${n}`);
  }
  if (patch.dueOn !== undefined) {
    params.push(patch.dueOn);
    n += 1;
    set.push(`due_on = $${n}`);
  }
  if (patch.billingRateCents !== undefined) {
    params.push(patch.billingRateCents);
    n += 1;
    set.push(`billing_rate_cents = $${n}`);
  }
  if (patch.isBillable !== undefined) {
    params.push(patch.isBillable);
    n += 1;
    set.push(`is_billable = $${n}`);
  }
  if (patch.position !== undefined) {
    params.push(patch.position);
    n += 1;
    set.push(`position = $${n}`);
  }
  if (patch.tags !== undefined) {
    params.push(patch.tags);
    n += 1;
    set.push(`tags = $${n}::text[]`);
  }
  if (patch.metadata !== undefined) {
    params.push(JSON.stringify(patch.metadata));
    n += 1;
    set.push(`metadata = $${n}::jsonb`);
  }

  // Status transition — auto-set / clear completed_at
  if (patch.status !== undefined) {
    params.push(patch.status);
    n += 1;
    set.push(`status = $${n}`);

    if (patch.status === 'done' || patch.status === 'cancelled') {
      set.push(`completed_at = now()`);
    } else {
      set.push(`completed_at = NULL`);
    }
  }

  if (set.length === 0) {
    const current = await getTask(id, userId);
    return current ? { kind: 'ok', task: current } : { kind: 'not_found' };
  }

  set.push(`updated_at = now()`);

  const r = await pool.query(
    `UPDATE agos_business_tasks
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getTask(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', task: after };
}

// ─── Cancel / reopen ──────────────────────────────────────────────────────

export type CancelTaskOutcome =
  | { kind: 'ok'; task: Task }
  | { kind: 'not_found' }
  | { kind: 'invalid_transition'; reason: string };

export async function cancelTask(
  id: string,
  userId: string,
): Promise<CancelTaskOutcome> {
  const before = await getTask(id, userId);
  if (!before) return { kind: 'not_found' };
  if (before.status === 'cancelled') {
    return {
      kind: 'invalid_transition',
      reason: 'Task is already cancelled',
    };
  }

  const pool = getBusinessPool();
  const r = await pool.query(
    `UPDATE agos_business_tasks
        SET status = 'cancelled',
            completed_at = now(),
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getTask(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', task: after };
}

export type ReopenTaskOutcome =
  | { kind: 'ok'; task: Task }
  | { kind: 'not_found' }
  | { kind: 'invalid_transition'; reason: string };

export async function reopenTask(
  id: string,
  userId: string,
): Promise<ReopenTaskOutcome> {
  const before = await getTask(id, userId);
  if (!before) return { kind: 'not_found' };
  if (before.status !== 'done' && before.status !== 'cancelled') {
    return {
      kind: 'invalid_transition',
      reason: `Task status is "${before.status}", not done or cancelled`,
    };
  }

  const pool = getBusinessPool();
  const r = await pool.query(
    `UPDATE agos_business_tasks
        SET status = 'todo',
            completed_at = NULL,
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getTask(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', task: after };
}

// ─── Ownership check ──────────────────────────────────────────────────────

export async function validateTaskOwnership(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_business_tasks
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}
