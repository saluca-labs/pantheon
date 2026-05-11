/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/steps
 *
 * GET  — list build steps for a project, ordered by ordinal ASC.
 * POST — create a new build step. ordinal defaults to MAX(ordinal)+1 when
 *        not provided.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  listBuildSteps,
  createBuildStep,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(8000).nullable().optional(),
  estMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
  blockerText: z.string().max(2000).nullable().optional(),
  ordinal: z.number().int().min(1).max(10_000).optional(),
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
    const steps = await listBuildSteps(projectId, user.userId);
    return NextResponse.json({ steps });
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
    const step = await createBuildStep(projectId, user.userId, parsed.data);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.step.created',
      payload: { projectId, stepId: step.id, ordinal: step.ordinal },
      projectId,
    });
    return NextResponse.json({ step }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create build step' },
      { status: 400 },
    );
  }
}
