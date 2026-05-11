/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/storyboards/[storyboardId]
 *
 * GET    — fetch storyboard + ordered panels.
 * PATCH  — update name/description/scene/status.
 * DELETE — delete (cascades panels).
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getStoryboard,
  updateStoryboard,
  deleteStoryboard,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import { STORYBOARD_STATUS_VALUES } from '@/lib/agentic-os/filmmaker/storyboards';

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional().nullable(),
  sceneId: z.string().uuid().optional().nullable(),
  status: z.enum(STORYBOARD_STATUS_VALUES).optional(),
});

interface Props {
  params: Promise<{ storyboardId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { storyboardId } = await params;
  const storyboard = await getStoryboard(storyboardId, user.userId);
  if (!storyboard) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ storyboard });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { storyboardId } = await params;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const storyboard = await updateStoryboard({
      id: storyboardId,
      userId: user.userId,
      patch: {
        name: parsed.data.name,
        description: parsed.data.description ?? undefined,
        sceneId:
          parsed.data.sceneId === undefined ? undefined : parsed.data.sceneId,
        status: parsed.data.status,
      },
    });
    if (!storyboard) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.storyboard.update',
      payload: { storyboardId },
    });
    return NextResponse.json({ storyboard });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { storyboardId } = await params;
  const ok = await deleteStoryboard(storyboardId, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.storyboard.delete',
    payload: { storyboardId },
  });
  return NextResponse.json({ ok: true });
}
