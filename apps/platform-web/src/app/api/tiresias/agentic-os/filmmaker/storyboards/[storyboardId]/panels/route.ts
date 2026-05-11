/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/storyboards/[storyboardId]/panels
 *
 * POST  — add a new panel (auto-assigns next position).
 * PATCH — reorder panels within the storyboard.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  addStoryboardPanel,
  reorderStoryboardPanels,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';

const CreateBody = z.object({
  imageUrl: z.string().url().max(2000).optional().nullable(),
  cameraAngle: z.string().max(200).optional().nullable(),
  cameraMove: z.string().max(200).optional().nullable(),
  shotSize: z.string().max(50).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  dialogueExcerpt: z.string().max(2000).optional().nullable(),
  durationSeconds: z.number().min(0).max(999.99).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

const ReorderBody = z.object({
  orderedPanelIds: z.array(z.string().uuid()).max(500),
});

interface Props {
  params: Promise<{ storyboardId: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { storyboardId } = await params;
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const panel = await addStoryboardPanel({
      storyboardId,
      userId: user.userId,
      data: parsed.data,
    });
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.panel.create',
      payload: { panelId: panel.id, storyboardId },
    });
    return NextResponse.json({ panel }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add panel' },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { storyboardId } = await params;
  const parsed = ReorderBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    await reorderStoryboardPanels(
      storyboardId,
      user.userId,
      parsed.data.orderedPanelIds,
    );
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.panel.reorder',
      payload: { storyboardId, count: parsed.data.orderedPanelIds.length },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reorder' },
      { status: 400 },
    );
  }
}
