/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/phase-progress
 *
 * PATCH — update one or more lifecycle-phase percentages on a project.
 *         Only the keys supplied are touched; other phases remain. Validates
 *         each phase value via `validatePhaseProgress` (integer 0..100, known
 *         phase keys only).
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { updatePhaseProgress, recordAudit } from '@/lib/agentic-os/maker/repo';
import {
  MAKER_PHASES,
  validatePhaseProgress,
  type MakerPhase,
} from '@/lib/agentic-os/maker/projects';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const body = await request.json().catch(() => null);
  const result = validatePhaseProgress(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Only forward keys that were actually present on the request body so we
  // don't accidentally zero phases the caller didn't intend to touch.
  const presentKeys = new Set<string>(Object.keys(body as Record<string, unknown>));
  const patch: Partial<Record<MakerPhase, number>> = {};
  for (const key of MAKER_PHASES) {
    if (presentKeys.has(key)) patch[key] = result.value[key];
  }

  const project = await updatePhaseProgress(id, user.userId, patch);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'maker.project.phase_progress_updated',
    payload: { projectId: id, phases: patch },
    projectId: id,
  });

  return NextResponse.json({ project });
}
