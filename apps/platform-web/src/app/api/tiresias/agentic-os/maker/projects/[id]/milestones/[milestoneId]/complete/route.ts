/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/milestones/[milestoneId]/complete
 *
 * PATCH — toggle the milestone's completed_at between NULL and now().
 *         Idempotency: the single SQL UPDATE evaluates the toggle on the
 *         current row state, so a single click swaps direction. The route
 *         is intentionally not parameterised — the toggle is the simplest
 *         one-click behaviour for the milestone strip.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { toggleMilestoneComplete, recordAudit } from '@/lib/agentic-os/maker/repo';

interface Props {
  params: Promise<{ id: string; milestoneId: string }>;
}

export async function PATCH(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, milestoneId } = await params;

  try {
    const milestone = await toggleMilestoneComplete(milestoneId, projectId, user.userId);
    if (!milestone) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action:
        milestone.completedAt != null
          ? 'maker.milestone.completed'
          : 'maker.milestone.uncompleted',
      payload: { projectId, milestoneId },
      projectId,
    });
    return NextResponse.json({ milestone });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to toggle completion' },
      { status: 400 },
    );
  }
}
