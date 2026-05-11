/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/steps/[stepId]
 *
 * GET    — fetch one build step.
 * PATCH  — partial update (title/body/estMinutes/blockerText/ordinal/metadata).
 * DELETE — remove one build step.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  getBuildStep,
  updateBuildStep,
  deleteBuildStep,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(8000).nullable().optional(),
  estMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
  blockerText: z.string().max(2000).nullable().optional(),
  ordinal: z.number().int().min(1).max(10_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string; stepId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, stepId } = await params;
  try {
    const step = await getBuildStep(stepId, projectId, user.userId);
    if (!step) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ step });
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
  const { id: projectId, stepId } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const step = await updateBuildStep(stepId, projectId, user.userId, parsed.data);
    if (!step) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.step.updated',
      payload: { projectId, stepId, fields: Object.keys(parsed.data) },
      projectId,
    });
    return NextResponse.json({ step });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update build step' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, stepId } = await params;
  try {
    const removed = await deleteBuildStep(stepId, projectId, user.userId);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.step.deleted',
      payload: { projectId, stepId },
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
