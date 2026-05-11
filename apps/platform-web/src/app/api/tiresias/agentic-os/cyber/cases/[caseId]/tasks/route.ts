/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/cases/[caseId]/tasks
 *
 * GET   — list tasks (sorted by position).
 * POST  — add task (auto-positions last; appends task_added event).
 * PATCH — reorder (body: { action: 'reorder', orderedIds: string[] }).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  listTasks,
  addTask,
  reorderTasks,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';
import {
  TASK_STATUS_VALUES,
  TASK_PRIORITY_VALUES,
} from '@/lib/agentic-os/cyber/cases';

const TaskBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(8000).nullable().optional(),
  status: z.enum(TASK_STATUS_VALUES).optional(),
  assignedTo: z.string().max(120).nullable().optional(),
  priority: z.enum(TASK_PRIORITY_VALUES).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

const ReorderBody = z.object({
  action: z.literal('reorder'),
  orderedIds: z.array(z.string().uuid()).max(500),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tasks = await listTasks(caseId, user.userId);
  return NextResponse.json({ tasks });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = TaskBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const task = await addTask({
    ownerId: user.userId,
    caseId,
    ...parsed.data,
  });
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.task.add',
    payload: { caseId, id: task.id },
  });
  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = ReorderBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const ok = await reorderTasks(caseId, user.userId, parsed.data.orderedIds);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.task.reorder',
    payload: { caseId, count: parsed.data.orderedIds.length },
  });
  return NextResponse.json({ ok: true });
}
