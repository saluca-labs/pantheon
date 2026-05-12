/**
 * Business OS Phase 3 — time-entries DB repository.
 *
 * Cross-ownership contract: every read / write filters by `user_id`
 * directly. A time-entry id belonging to another user returns null on get /
 * update / delete.
 *
 * Timer invariants: at most one running timer (ended_at IS NULL) per user.
 * `startTimer` returns `concurrent_timer` if a running entry already exists.
 *
 * @license MIT — Tiresias Business OS Phase 3 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import type {
  TimeEntry,
  CreateTimeEntryInput,
  StartTimerInput,
  UpdateTimeEntryInput,
  TimeEntriesListOpts,
} from './time-entries';

const TE_COLUMNS = `id, user_id, task_id, project_id, description,
                       started_at, ended_at, duration_minutes, is_billable,
                       billing_rate_cents, billed_at, invoice_id, metadata,
                       created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toIso(v);
}

function rowToTimeEntry(row: any): TimeEntry {
  return {
    id: row.id,
    userId: row.user_id,
    taskId: row.task_id,
    projectId: row.project_id,
    description: row.description ?? '',
    startedAt: toIso(row.started_at),
    endedAt: toIsoOrNull(row.ended_at),
    durationMinutes:
      row.duration_minutes != null ? Number(row.duration_minutes) : null,
    isBillable: Boolean(row.is_billable),
    billingRateCents:
      row.billing_rate_cents != null ? Number(row.billing_rate_cents) : null,
    billedAt: toIsoOrNull(row.billed_at),
    invoiceId: row.invoice_id ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function listTimeEntries(
  userId: string,
  opts: TimeEntriesListOpts = {},
): Promise<TimeEntry[]> {
  const pool = getBusinessPool();
  const params: any[] = [userId];
  const where: string[] = [`user_id = $1`];

  if (opts.taskId) {
    params.push(opts.taskId);
    where.push(`task_id = $${params.length}`);
  }

  if (opts.projectId) {
    params.push(opts.projectId);
    where.push(`project_id = $${params.length}`);
  }

  if (opts.isBillable !== undefined) {
    params.push(opts.isBillable);
    where.push(`is_billable = $${params.length}`);
  }

  if (opts.unbilled === true) {
    where.push(`billed_at IS NULL`);
    where.push(`is_billable = TRUE`);
  }

  if (opts.running === true) {
    where.push(`ended_at IS NULL`);
  } else if (opts.running === false) {
    where.push(`ended_at IS NOT NULL`);
  }

  if (opts.startedAfter) {
    params.push(opts.startedAfter);
    where.push(`started_at >= $${params.length}`);
  }

  if (opts.startedBefore) {
    params.push(opts.startedBefore);
    where.push(`started_at <= $${params.length}`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await pool.query(
    `SELECT ${TE_COLUMNS}
       FROM agos_business_time_entries
      WHERE ${where.join(' AND ')}
      ORDER BY started_at DESC
      LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return r.rows.map(rowToTimeEntry);
}

// ─── Get one ──────────────────────────────────────────────────────────────

export async function getTimeEntry(
  id: string,
  userId: string,
): Promise<TimeEntry | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${TE_COLUMNS}
       FROM agos_business_time_entries
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToTimeEntry(r.rows[0]);
}

// ─── Running timer ───────────────────────────────────────────────────────

export async function getRunningTimer(
  userId: string,
): Promise<TimeEntry | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${TE_COLUMNS}
       FROM agos_business_time_entries
      WHERE user_id = $1 AND ended_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1`,
    [userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToTimeEntry(r.rows[0]);
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createTimeEntry(
  userId: string,
  data: CreateTimeEntryInput,
): Promise<TimeEntry> {
  const pool = getBusinessPool();
  const id = randomUUID();

  // Snapshot billing_rate_cents from the task or project if not provided
  let billingRateCents = data.billingRateCents ?? null;
  if (billingRateCents == null) {
    const rateR = await pool.query(
      `SELECT
         COALESCE(t.billing_rate_cents, p.default_rate_cents) AS rate
       FROM agos_business_tasks t
       JOIN agos_business_projects p ON p.id = t.project_id
       WHERE t.id = $1 AND t.user_id = $2
       LIMIT 1`,
      [data.taskId, userId],
    );
    if (rateR.rows[0]?.rate != null) {
      billingRateCents = Number(rateR.rows[0].rate);
    }
  }

  await pool.query(
    `INSERT INTO agos_business_time_entries
       (id, user_id, task_id, project_id, description, started_at,
        duration_minutes, is_billable, billing_rate_cents, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [
      id,
      userId,
      data.taskId,
      data.projectId,
      data.description ?? '',
      data.startedAt ?? new Date().toISOString(),
      data.durationMinutes ?? null,
      data.isBillable ?? true,
      billingRateCents,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const after = await getTimeEntry(id, userId);
  if (!after) throw new Error('Failed to create time entry');
  return after;
}

// ─── Start / stop timer ──────────────────────────────────────────────────

export type StartTimerOutcome =
  | { kind: 'ok'; entry: TimeEntry }
  | { kind: 'concurrent_timer'; running: TimeEntry };

export async function startTimer(
  userId: string,
  data: StartTimerInput,
): Promise<StartTimerOutcome> {
  const running = await getRunningTimer(userId);
  if (running) {
    return { kind: 'concurrent_timer', running };
  }

  const pool = getBusinessPool();
  const id = randomUUID();

  // Snapshot billing_rate_cents from the task or project if not provided
  let billingRateCents = data.billingRateCents ?? null;
  if (billingRateCents == null) {
    const rateR = await pool.query(
      `SELECT
         COALESCE(t.billing_rate_cents, p.default_rate_cents) AS rate
       FROM agos_business_tasks t
       JOIN agos_business_projects p ON p.id = t.project_id
       WHERE t.id = $1 AND t.user_id = $2
       LIMIT 1`,
      [data.taskId, userId],
    );
    if (rateR.rows[0]?.rate != null) {
      billingRateCents = Number(rateR.rows[0].rate);
    }
  }

  await pool.query(
    `INSERT INTO agos_business_time_entries
       (id, user_id, task_id, project_id, description, started_at,
        is_billable, billing_rate_cents, metadata)
     VALUES ($1,$2,$3,$4,$5,now(),$6,$7,$8::jsonb)`,
    [
      id,
      userId,
      data.taskId,
      data.projectId,
      data.description ?? '',
      data.isBillable ?? true,
      billingRateCents,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  const after = await getTimeEntry(id, userId);
  if (!after) throw new Error('Failed to start timer');
  return { kind: 'ok', entry: after };
}

export type StopTimerOutcome =
  | { kind: 'ok'; entry: TimeEntry }
  | { kind: 'not_found' }
  | { kind: 'already_stopped' };

export async function stopTimer(
  id: string,
  userId: string,
): Promise<StopTimerOutcome> {
  const before = await getTimeEntry(id, userId);
  if (!before) return { kind: 'not_found' };
  if (before.endedAt != null) return { kind: 'already_stopped' };

  const pool = getBusinessPool();
  const r = await pool.query(
    `UPDATE agos_business_time_entries
        SET ended_at = now(),
            duration_minutes = EXTRACT(EPOCH FROM (now() - started_at)) / 60,
            updated_at = now()
      WHERE id = $1 AND user_id = $2 AND ended_at IS NULL
      RETURNING id`,
    [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getTimeEntry(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', entry: after };
}

// ─── Update ───────────────────────────────────────────────────────────────

export type UpdateTimeEntryOutcome =
  | { kind: 'ok'; entry: TimeEntry }
  | { kind: 'not_found' };

export async function updateTimeEntry(
  id: string,
  userId: string,
  patch: UpdateTimeEntryInput,
): Promise<UpdateTimeEntryOutcome> {
  const pool = getBusinessPool();
  const set: string[] = [];
  const params: any[] = [id, userId];
  let n = 2;

  if (patch.taskId !== undefined) {
    params.push(patch.taskId);
    n += 1;
    set.push(`task_id = $${n}`);
  }
  if (patch.projectId !== undefined) {
    params.push(patch.projectId);
    n += 1;
    set.push(`project_id = $${n}`);
  }
  if (patch.description !== undefined) {
    params.push(patch.description);
    n += 1;
    set.push(`description = $${n}`);
  }
  if (patch.startedAt !== undefined) {
    params.push(patch.startedAt);
    n += 1;
    set.push(`started_at = $${n}`);
  }
  if (patch.durationMinutes !== undefined) {
    params.push(patch.durationMinutes);
    n += 1;
    set.push(`duration_minutes = $${n}`);
  }
  if (patch.isBillable !== undefined) {
    params.push(patch.isBillable);
    n += 1;
    set.push(`is_billable = $${n}`);
  }
  if (patch.billingRateCents !== undefined) {
    params.push(patch.billingRateCents);
    n += 1;
    set.push(`billing_rate_cents = $${n}`);
  }
  if (patch.metadata !== undefined) {
    params.push(JSON.stringify(patch.metadata));
    n += 1;
    set.push(`metadata = $${n}::jsonb`);
  }

  if (set.length === 0) {
    const current = await getTimeEntry(id, userId);
    return current
      ? { kind: 'ok', entry: current }
      : { kind: 'not_found' };
  }

  set.push(`updated_at = now()`);

  const r = await pool.query(
    `UPDATE agos_business_time_entries
        SET ${set.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    params,
  );
  if ((r.rowCount ?? 0) === 0) return { kind: 'not_found' };
  const after = await getTimeEntry(id, userId);
  if (!after) return { kind: 'not_found' };
  return { kind: 'ok', entry: after };
}

// ─── Delete (hard) ───────────────────────────────────────────────────────

export async function deleteTimeEntry(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `DELETE FROM agos_business_time_entries
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Mark billed ─────────────────────────────────────────────────────────

export async function markBilled(
  id: string,
  userId: string,
  invoiceId: string,
): Promise<TimeEntry | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `UPDATE agos_business_time_entries
        SET billed_at = now(),
            invoice_id = $3,
            updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [id, userId, invoiceId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getTimeEntry(id, userId);
}

// ─── Ownership check ──────────────────────────────────────────────────────

export async function validateTimeEntryOwnership(
  id: string,
  userId: string,
): Promise<boolean> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT 1 FROM agos_business_time_entries
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}
