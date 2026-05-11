/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/steps/reorder
 *
 * PATCH — renumber build-step ordinals 1..N from the given id sequence.
 *         Body shape: `{ order: [{stepId, ordinal}, ...] }`. The `ordinal`
 *         field on each entry is advisory — the server-side reorder uses
 *         the array order to renumber 1..N inside a single transaction. Ids
 *         not present in the array keep their relative position appended to
 *         the end.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { reorderBuildSteps, recordAudit } from '@/lib/agentic-os/maker/repo';

const Body = z.object({
  order: z
    .array(
      z.object({
        stepId: z.string().uuid(),
        ordinal: z.number().int().min(1).max(10_000).optional(),
      }),
    )
    .max(2000),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const orderedIds = parsed.data.order.map((o) => o.stepId);

  try {
    await reorderBuildSteps(projectId, user.userId, orderedIds);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.step.reordered',
      payload: { projectId, count: orderedIds.length },
      projectId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reorder' },
      { status: 400 },
    );
  }
}
