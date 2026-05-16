/**
 * Business OS Phase 3 — single task route.
 *
 * GET    /api/tiresias/agentic-os/business/tasks/[id]
 * PATCH  /api/tiresias/agentic-os/business/tasks/[id]
 *   Partial update including status transitions (repo auto-manages
 *   completed_at).  Audits `business.task.updated`.
 * DELETE /api/tiresias/agentic-os/business/tasks/[id]
 *   Cancel the task.  Audits `business.task.cancelled`.
 *
 * @license MIT — Tiresias Business OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getTask,
  updateTask,
  cancelTask,
} from '@/lib/agentic-os/business/tasks-repo';
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/agentic-os/business/tasks';

const PatchBody = z
  .object({
    title: z.string().min(1).max(300).optional(),
    project_id: z.string().uuid().optional(),
    description_md: z.string().max(50_000).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    assignee_text: z.string().max(200).nullable().optional(),
    due_on: z.string().nullable().optional(),
    billing_rate_cents: z.number().int().nullable().optional(),
    is_billable: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
    tags: z.array(z.string().min(1).max(60)).max(50).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const task = await getTask(id, user.userId);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ task });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getTask(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const outcome = await updateTask(id, user.userId, {
    title: d.title,
    projectId: d.project_id,
    descriptionMd: d.description_md,
    status: d.status,
    priority: d.priority,
    assigneeText: d.assignee_text,
    dueOn: d.due_on,
    billingRateCents: d.billing_rate_cents,
    isBillable: d.is_billable,
    position: d.position,
    tags: d.tags,
    metadata: d.metadata,
  });
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'business.task.updated',
    payload: { taskId: id, fields: Object.keys(d) },
  });
  return NextResponse.json({ task: outcome.task });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await getTask(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const outcome = await cancelTask(id, user.userId);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.kind === 'invalid_transition') {
    return NextResponse.json({ error: outcome.reason }, { status: 400 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'business.task.cancelled',
    payload: { taskId: id },
  });
  return NextResponse.json({ task: outcome.task });
}
