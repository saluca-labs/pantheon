/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/storyboards/[storyboardId]/panels/[panelId]/move
 *
 * POST — move panel within or across storyboards.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { movePanel, recordAudit } from '@/lib/agentic-os/filmmaker/repo';

const Body = z.object({
  toStoryboardId: z.string().uuid().optional().nullable(),
  toPosition: z.number().int().min(1).max(2000),
});

interface Props {
  params: Promise<{ storyboardId: string; panelId: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { panelId } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const panel = await movePanel({
      panelId,
      toStoryboardId: parsed.data.toStoryboardId ?? undefined,
      toPosition: parsed.data.toPosition,
      userId: user.userId,
    });
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.panel.move',
      payload: {
        panelId,
        toStoryboardId: parsed.data.toStoryboardId ?? null,
        toPosition: parsed.data.toPosition,
      },
    });
    return NextResponse.json({ panel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to move panel' },
      { status: 400 },
    );
  }
}
