/**
 * Business OS Phase 3 — tasks collection route.
 *
 * GET  /api/tiresias/agentic-os/business/tasks
 *   List tasks scoped to the caller.  REQUIRES `project_id` query param.
 *   Query:
 *     ?project_id=<uuid>      REQUIRED — scope to one project
 *     ?status=<value>         filter by single TaskStatus
 *     ?priority=<value>       filter by single TaskPriority
 *     ?due_before=<date>      due_on <= date
 *     ?due_after=<date>       due_on >= date
 *     ?is_billable=true       filter by billable flag
 *     ?assignee_text=<value>  exact match (case-insensitive)
 *     ?tag=<value>            single-tag ANY-match (case-insensitive)
 *     ?q=<text>               free-text search across title/description_md
 *     ?limit=<n>&offset=<n>   pagination (limit 1..500)
 *
 * POST /api/tiresias/agentic-os/business/tasks
 *   Create a new task.  Audits `business.task.created`.
 *
 * @license MIT — Tiresias Business OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { listTasks, createTask } from '@/lib/agentic-os/business/tasks-repo';
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  type TaskStatus,
  type TaskPriority,
} from '@/lib/agentic-os/business/tasks';

const CreateBody = z.object({
  title: z.string().min(1).max(300),
  project_id: z.string().uuid(),
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
});

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const projectIdParam = url.searchParams.get('project_id');

  if (!projectIdParam) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(projectIdParam)) {
    return NextResponse.json({ error: 'project_id must be a UUID' }, { status: 400 });
  }

  const statusParam = url.searchParams.get('status');
  const priorityParam = url.searchParams.get('priority');
  const dueBeforeParam = url.searchParams.get('due_before');
  const dueAfterParam = url.searchParams.get('due_after');
  const isBillableParam = url.searchParams.get('is_billable');
  const assigneeTextParam = url.searchParams.get('assignee_text');
  const tagParam = url.searchParams.get('tag');
  const qParam = url.searchParams.get('q');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (statusParam && !(TASK_STATUSES as readonly string[]).includes(statusParam)) {
    return NextResponse.json(
      { error: `Invalid status: "${statusParam}". Valid: ${TASK_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }
  if (priorityParam && !(TASK_PRIORITIES as readonly string[]).includes(priorityParam)) {
    return NextResponse.json(
      { error: `Invalid priority: "${priorityParam}". Valid: ${TASK_PRIORITIES.join(', ')}` },
      { status: 400 },
    );
  }

  const limit = limitParam ? Number(limitParam) : undefined;
  const offset = offsetParam ? Number(offsetParam) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 500)) {
    return NextResponse.json({ error: 'Invalid limit (1..500)' }, { status: 400 });
  }
  if (offset !== undefined && (!Number.isFinite(offset) || offset < 0)) {
    return NextResponse.json({ error: 'Invalid offset (>= 0)' }, { status: 400 });
  }

  const tasks = await listTasks(user.userId, {
    projectId: projectIdParam,
    status: (statusParam as TaskStatus) ?? undefined,
    priority: (priorityParam as TaskPriority) ?? undefined,
    dueBefore: dueBeforeParam ?? undefined,
    dueAfter: dueAfterParam ?? undefined,
    isBillable: isBillableParam === 'true' ? true : isBillableParam === 'false' ? false : undefined,
    assigneeText: assigneeTextParam ?? undefined,
    tag: tagParam ?? undefined,
    q: qParam ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const task = await createTask(user.userId, {
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
  await recordAudit({
    actorId: user.userId,
    action: 'business.task.created',
    payload: { taskId: task.id, projectId: task.projectId },
  });
  return NextResponse.json({ task }, { status: 201 });
}
