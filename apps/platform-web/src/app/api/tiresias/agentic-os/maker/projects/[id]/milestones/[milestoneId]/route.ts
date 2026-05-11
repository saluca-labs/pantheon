/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/milestones/[milestoneId]
 *
 * GET    — fetch one milestone.
 * PATCH  — partial update (label/due_at/notes/sort_order/metadata).
 * DELETE — remove one milestone.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  getMilestone,
  updateMilestone,
  deleteMilestone,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';

const PatchBody = z.object({
  label: z.string().min(1).max(200).optional(),
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  sortOrder: z.number().int().min(-100_000).max(100_000).optional(),
  notes: z.string().max(4000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string; milestoneId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, milestoneId } = await params;
  try {
    const milestone = await getMilestone(milestoneId, projectId, user.userId);
    if (!milestone) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ milestone });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not found' },
      { status: 404 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, milestoneId } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const milestone = await updateMilestone(
      milestoneId,
      projectId,
      user.userId,
      parsed.data,
    );
    if (!milestone) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.milestone.updated',
      payload: { projectId, milestoneId, fields: Object.keys(parsed.data) },
      projectId,
    });
    return NextResponse.json({ milestone });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update milestone' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, milestoneId } = await params;
  try {
    const removed = await deleteMilestone(milestoneId, projectId, user.userId);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.milestone.deleted',
      payload: { projectId, milestoneId },
      projectId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 400 },
    );
  }
}
