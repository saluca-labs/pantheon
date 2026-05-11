/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/strips/[stripId]
 *
 * PATCH  — update strip estMinutes / notes.
 * DELETE — remove from day (auto-flips scene meta back to 'unscheduled'
 *          if no other strip references it).
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getStripPublic,
  updateStrip,
  removeStripFromDay,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';

const PatchBody = z
  .object({
    estMinutes: z.number().int().min(0).max(10000).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .strict();

interface Props {
  params: Promise<{ stripId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { stripId } = await params;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await updateStrip({
    id: stripId,
    userId: user.userId,
    patch: parsed.data,
  });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.strip.update',
    payload: { stripId, patch: parsed.data },
  });
  return NextResponse.json({ strip: updated });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { stripId } = await params;
  const existing = await getStripPublic(stripId, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await removeStripFromDay(stripId, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.strip.delete',
    payload: { stripId, dayId: existing.shootingDayId, sceneId: existing.sceneId },
  });
  return NextResponse.json({ ok: true });
}
