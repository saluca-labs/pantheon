/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects/[id]/shooting-days/reorder
 *
 * POST — renumber days 1..N using the given id sequence (per-unit).
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  reorderShootingDays,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';

const Body = z.object({
  orderedDayIds: z.array(z.string().uuid()).max(2000),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await reorderShootingDays(id, user.userId, parsed.data.orderedDayIds);
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.shooting_day.reorder',
      payload: { projectId: id, count: parsed.data.orderedDayIds.length },
      projectId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reorder' },
      { status: 400 },
    );
  }
}
