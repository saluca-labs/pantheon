/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/steps/[stepId]/complete
 *
 * PATCH — one-click complete. Sets completed_at = now() when currently NULL.
 *         With ?undo=true, clears completed_at back to NULL. Idempotent:
 *         repeated calls with the same direction never write a second time.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { completeStep, recordAudit } from '@/lib/agentic-os/maker/repo';

interface Props {
  params: Promise<{ id: string; stepId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, stepId } = await params;
  const undo = request.nextUrl.searchParams.get('undo') === 'true';

  try {
    const step = await completeStep(stepId, projectId, user.userId, { undo });
    if (!step) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: undo ? 'maker.step.uncompleted' : 'maker.step.completed',
      payload: { projectId, stepId },
      projectId,
    });
    return NextResponse.json({ step });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to toggle completion' },
      { status: 400 },
    );
  }
}
