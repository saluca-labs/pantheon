/**
 * Research OS Phase 6 — /api/tiresias/agentic-os/research/experiments/[id]/milestones
 *
 * GET  — list milestones for the experiment. Optional filters: status,
 *        priority, isBlocker.
 * POST — create a milestone. `title` is required.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  isExperimentOwnedByUser,
  listMilestonesForExperiment,
  createMilestone,
} from '@/lib/agentic-os/research/milestones-repo';
import {
  MILESTONE_STATUS_VALUES,
  MILESTONE_PRIORITY_VALUES,
} from '@/lib/agentic-os/research/milestones';

const STATUS_ENUM = z.enum(
  MILESTONE_STATUS_VALUES as unknown as [string, ...string[]],
);
const PRIORITY_ENUM = z.enum(
  MILESTONE_PRIORITY_VALUES as unknown as [string, ...string[]],
);

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  status: STATUS_ENUM.optional(),
  priority: PRIORITY_ENUM.optional(),
  isBlocker: z.boolean().optional(),
  blockedReason: z.string().max(4000).nullable().optional(),
  notesMd: z.string().max(20000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: experimentId } = await params;

  const owned = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status');
  const priorityFilter = url.searchParams.get('priority');
  const blockerFilter = url.searchParams.get('isBlocker');

  if (statusFilter && !(MILESTONE_STATUS_VALUES as readonly string[]).includes(statusFilter)) {
    return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
  }
  if (
    priorityFilter &&
    !(MILESTONE_PRIORITY_VALUES as readonly string[]).includes(priorityFilter)
  ) {
    return NextResponse.json({ error: 'Invalid priority filter' }, { status: 400 });
  }
  let isBlocker: boolean | undefined;
  if (blockerFilter != null) {
    if (blockerFilter === 'true') isBlocker = true;
    else if (blockerFilter === 'false') isBlocker = false;
    else {
      return NextResponse.json({ error: 'isBlocker must be true or false' }, { status: 400 });
    }
  }

  try {
    const milestones = await listMilestonesForExperiment(experimentId, user.userId, {
      status: (statusFilter as any) ?? undefined,
      priority: (priorityFilter as any) ?? undefined,
      isBlocker,
    });
    return NextResponse.json({ milestones });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: experimentId } = await params;

  const owned = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const milestone = await createMilestone(experimentId, user.userId, parsed.data as any);
    await recordAudit({
      actorId: user.userId,
      action: 'research.milestone.created',
      payload: {
        experimentId,
        milestoneId: milestone.id,
        title: milestone.title,
      },
      projectId: experimentId,
    });
    return NextResponse.json({ milestone }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create milestone' },
      { status: 400 },
    );
  }
}
