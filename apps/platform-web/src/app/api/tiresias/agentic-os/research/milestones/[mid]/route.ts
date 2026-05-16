/**
 * Research OS Phase 6 — /api/tiresias/agentic-os/research/milestones/[mid]
 *
 * GET    — fetch a single milestone (cross-ownership 404).
 * PATCH  — partial update. Setting status='done' auto-stamps completed_at;
 *          setting status to any non-done value clears completed_at.
 *          Records 'research.milestone.completed' audit when status flips
 *          to done.
 * DELETE — hard-delete the milestone.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  getMilestone,
  updateMilestone,
  deleteMilestone,
} from '@/lib/agentic-os/research/milestones-repo';
import {
  MILESTONE_STATUS_VALUES,
  MILESTONE_PRIORITY_VALUES,
  type UpdateMilestoneInput,
} from '@/lib/agentic-os/research/milestones';

const STATUS_ENUM = z.enum(
  MILESTONE_STATUS_VALUES as unknown as [string, ...string[]],
);
const PRIORITY_ENUM = z.enum(
  MILESTONE_PRIORITY_VALUES as unknown as [string, ...string[]],
);

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
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
  params: Promise<{ mid: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { mid } = await params;
  const milestone = await getMilestone(mid, user.userId);
  if (!milestone) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ milestone });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { mid } = await params;

  const existing = await getMilestone(mid, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const milestone = await updateMilestone(mid, user.userId, parsed.data as UpdateMilestoneInput);
    if (!milestone) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await recordAudit({
      actorId: user.userId,
      action: 'research.milestone.updated',
      payload: { experimentId: existing.experimentId, milestoneId: mid, fields: Object.keys(parsed.data) },
      projectId: existing.experimentId,
    });

    if (parsed.data.status === 'done' && existing.status !== 'done') {
      await recordAudit({
        actorId: user.userId,
        action: 'research.milestone.completed',
        payload: { experimentId: existing.experimentId, milestoneId: mid },
        projectId: existing.experimentId,
      });
    }

    return NextResponse.json({ milestone });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update milestone' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { mid } = await params;

  const existing = await getMilestone(mid, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await deleteMilestone(mid, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'research.milestone.deleted',
    payload: { experimentId: existing.experimentId, milestoneId: mid },
    projectId: existing.experimentId,
  });

  return NextResponse.json({ ok: true });
}
