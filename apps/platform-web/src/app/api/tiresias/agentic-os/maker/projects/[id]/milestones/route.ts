/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/milestones
 *
 * GET  — list milestones for the project, ordered by sort_order ASC.
 * POST — create a milestone. `label` is required; due_at / sort_order /
 *        notes / metadata + Phase 6 fields (status, priority, is_blocker,
 *        blocked_reason) are optional.
 *
 * @license MIT — Tiresias Maker OS Phase 3 + Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  listMilestones,
  createMilestone,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import {
  MILESTONE_STORED_STATUS_VALUES,
  MILESTONE_PRIORITY_VALUES,
} from '@/lib/agentic-os/maker/milestones';

const STATUS_ENUM = z.enum(
  MILESTONE_STORED_STATUS_VALUES as unknown as [string, ...string[]],
);
const PRIORITY_ENUM = z.enum(
  MILESTONE_PRIORITY_VALUES as unknown as [string, ...string[]],
);

const CreateBody = z.object({
  label: z.string().min(1).max(200),
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  sortOrder: z.number().int().min(-100_000).max(100_000).optional(),
  notes: z.string().max(4000).nullable().optional(),
  status: STATUS_ENUM.optional(),
  priority: PRIORITY_ENUM.optional(),
  isBlocker: z.boolean().optional(),
  blockedReason: z.string().max(4000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  try {
    const milestones = await listMilestones(projectId, user.userId);
    return NextResponse.json({ milestones });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not found' },
      { status: 404 },
    );
  }
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const milestone = await createMilestone(projectId, user.userId, parsed.data as any);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.milestone.created',
      payload: { projectId, milestoneId: milestone.id, label: milestone.label },
      projectId,
    });
    return NextResponse.json({ milestone }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create milestone' },
      { status: 400 },
    );
  }
}
