/**
 * Business OS Phase 3 — time-entries collection route.
 *
 * GET  /api/tiresias/agentic-os/business/time-entries
 *   List time entries scoped to the caller.
 *   Query:
 *     ?task_id=<uuid>         scope to one task
 *     ?project_id=<uuid>      scope to one project
 *     ?is_billable=true       filter by billable flag
 *     ?unbilled=true          only unbilled billable entries
 *     ?running=true           only running timers (returns single entry)
 *     ?started_after=<iso>    started_at >= ISO timestamp
 *     ?started_before=<iso>   started_at <= ISO timestamp
 *     ?limit=<n>&offset=<n>   pagination (limit 1..500)
 *
 * POST /api/tiresias/agentic-os/business/time-entries
 *   Create a new time entry.  If `?start_timer=true`, uses startTimer()
 *   (enforces single-running-timer gate).  Audits
 *   `business.time_entry.created`.
 *
 * @license MIT — Tiresias Business OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  listTimeEntries,
  getRunningTimer,
  createTimeEntry,
  startTimer,
} from '@/lib/agentic-os/business/time-entries-repo';

const CreateBody = z.object({
  task_id: z.string().uuid(),
  project_id: z.string().uuid(),
  description: z.string().max(500).optional(),
  started_at: z.string().optional(),
  duration_minutes: z.number().nullable().optional(),
  is_billable: z.boolean().optional(),
  billing_rate_cents: z.number().int().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const taskIdParam = url.searchParams.get('task_id');
  const projectIdParam = url.searchParams.get('project_id');
  const isBillableParam = url.searchParams.get('is_billable');
  const unbilledParam = url.searchParams.get('unbilled');
  const runningParam = url.searchParams.get('running');
  const startedAfterParam = url.searchParams.get('started_after');
  const startedBeforeParam = url.searchParams.get('started_before');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (taskIdParam && !/^[0-9a-f-]{36}$/i.test(taskIdParam)) {
    return NextResponse.json({ error: 'task_id must be a UUID' }, { status: 400 });
  }
  if (projectIdParam && !/^[0-9a-f-]{36}$/i.test(projectIdParam)) {
    return NextResponse.json({ error: 'project_id must be a UUID' }, { status: 400 });
  }

  const limit = limitParam ? Number(limitParam) : undefined;
  const offset = offsetParam ? Number(offsetParam) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 500)) {
    return NextResponse.json({ error: 'Invalid limit (1..500)' }, { status: 400 });
  }
  if (offset !== undefined && (!Number.isFinite(offset) || offset < 0)) {
    return NextResponse.json({ error: 'Invalid offset (>= 0)' }, { status: 400 });
  }

  // Running timer shortcut — returns a single entry
  if (runningParam === 'true') {
    const entry = await getRunningTimer(user.userId);
    return NextResponse.json({ entries: entry ? [entry] : [] });
  }

  const entries = await listTimeEntries(user.userId, {
    taskId: taskIdParam ?? undefined,
    projectId: projectIdParam ?? undefined,
    isBillable: isBillableParam === 'true' ? true : isBillableParam === 'false' ? false : undefined,
    unbilled: unbilledParam === 'true',
    running: undefined, // non-running filter handled above
    startedAfter: startedAfterParam ?? undefined,
    startedBefore: startedBeforeParam ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const startTimerParam = url.searchParams.get('start_timer');

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  if (startTimerParam === 'true') {
    const outcome = await startTimer(user.userId, {
      taskId: d.task_id,
      projectId: d.project_id,
      description: d.description,
      isBillable: d.is_billable,
      billingRateCents: d.billing_rate_cents,
      metadata: d.metadata,
    });
    if (outcome.kind === 'concurrent_timer') {
      return NextResponse.json(
        { error: 'A timer is already running', running: outcome.running },
        { status: 409 },
      );
    }
    await recordAudit({
      actorId: user.userId,
      action: 'business.time_entry.created',
      payload: { entryId: outcome.entry.id, taskId: outcome.entry.taskId },
    });
    return NextResponse.json({ entry: outcome.entry }, { status: 201 });
  }

  const entry = await createTimeEntry(user.userId, {
    taskId: d.task_id,
    projectId: d.project_id,
    description: d.description,
    startedAt: d.started_at,
    durationMinutes: d.duration_minutes,
    isBillable: d.is_billable,
    billingRateCents: d.billing_rate_cents,
    metadata: d.metadata,
  });
  await recordAudit({
    actorId: user.userId,
    action: 'business.time_entry.created',
    payload: { entryId: entry.id, taskId: entry.taskId },
  });
  return NextResponse.json({ entry }, { status: 201 });
}
