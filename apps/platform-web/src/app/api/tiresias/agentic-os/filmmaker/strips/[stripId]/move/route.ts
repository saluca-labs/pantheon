/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/strips/[stripId]/move
 *
 * POST — move a strip within or across shooting days. Transactional;
 *        reindexes both source + destination day so siblings stay
 *        contiguous.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  moveStrip,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';

const Body = z.object({
  toShootingDayId: z.string().uuid().optional().nullable(),
  toOrderIndex: z.number().int().min(0).max(2000),
});

interface Props {
  params: Promise<{ stripId: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { stripId } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const moved = await moveStrip({
      stripId,
      toShootingDayId: parsed.data.toShootingDayId ?? null,
      toOrderIndex: parsed.data.toOrderIndex,
      userId: user.userId,
    });
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.strip.move',
      payload: {
        stripId,
        toShootingDayId: parsed.data.toShootingDayId ?? null,
        toOrderIndex: parsed.data.toOrderIndex,
      },
    });
    return NextResponse.json({ strip: moved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to move strip' },
      { status: 400 },
    );
  }
}
