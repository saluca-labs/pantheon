/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects/[id]/phase-progress
 *
 * PATCH — update one or more lifecycle-phase percentages on a project.
 *         Only the keys supplied are touched; other phases remain.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { updatePhaseProgress, recordAudit } from '@/lib/agentic-os/filmmaker/repo';
import { PHASE_KEYS } from '@/lib/agentic-os/filmmaker/projects';

const PhaseProgressSchema = z
  .object(
    Object.fromEntries(PHASE_KEYS.map((k) => [k, z.number().min(0).max(100).optional()])),
  )
  .partial();

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const parsed = PhaseProgressSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const project = await updatePhaseProgress(id, user.userId, parsed.data as any);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.project.phase_progress_update',
    payload: { projectId: id, phases: parsed.data },
    projectId: id,
  });

  return NextResponse.json({ project });
}
