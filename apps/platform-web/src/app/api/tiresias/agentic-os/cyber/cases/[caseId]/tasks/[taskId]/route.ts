/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/cases/[caseId]/tasks/[taskId]
 *
 * GET    — fetch single task.
 * PATCH  — update task fields (auto-event on status → done / off done).
 * DELETE — delete task.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  getTask,
  updateTask,
  deleteTask,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';
import {
  TASK_STATUS_VALUES,
  TASK_PRIORITY_VALUES,
} from '@/lib/agentic-os/cyber/cases';

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(8000).nullable().optional(),
  status: z.enum(TASK_STATUS_VALUES).optional(),
  assignedTo: z.string().max(120).nullable().optional(),
  priority: z.enum(TASK_PRIORITY_VALUES).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  position: z.number().int().min(0).optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ caseId: string; taskId: string }> },
) {
  const { taskId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const task = await getTask(taskId, user.userId);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ task });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ caseId: string; taskId: string }> },
) {
  const { taskId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const task = await updateTask({
    id: taskId,
    ownerId: user.userId,
    ...parsed.data,
  });
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.task.update',
    payload: { id: taskId, fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ task });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ caseId: string; taskId: string }> },
) {
  const { taskId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ok = await deleteTask(taskId, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.task.delete',
    payload: { id: taskId },
  });
  return NextResponse.json({ ok: true });
}
