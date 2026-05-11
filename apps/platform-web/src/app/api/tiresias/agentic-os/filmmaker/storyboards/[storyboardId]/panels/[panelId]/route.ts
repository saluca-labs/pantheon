/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/storyboards/[storyboardId]/panels/[panelId]
 *
 * PATCH  — update panel fields.
 * DELETE — delete + reindex siblings.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  updateStoryboardPanel,
  deleteStoryboardPanel,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';

const PatchBody = z.object({
  imageUrl: z.string().url().max(2000).optional().nullable(),
  cameraAngle: z.string().max(200).optional().nullable(),
  cameraMove: z.string().max(200).optional().nullable(),
  shotSize: z.string().max(50).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  dialogueExcerpt: z.string().max(2000).optional().nullable(),
  durationSeconds: z.number().min(0).max(999.99).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

interface Props {
  params: Promise<{ storyboardId: string; panelId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { panelId } = await params;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const panel = await updateStoryboardPanel({
    id: panelId,
    userId: user.userId,
    patch: parsed.data,
  });
  if (!panel) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.panel.update',
    payload: { panelId },
  });
  return NextResponse.json({ panel });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { panelId } = await params;
  const ok = await deleteStoryboardPanel(panelId, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.panel.delete',
    payload: { panelId },
  });
  return NextResponse.json({ ok: true });
}
