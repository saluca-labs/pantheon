/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/shooting-days/[dayId]/strips
 *
 * POST  — add a strip (scene → day).
 * PATCH — reorder strips within the day.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  addStripToDay,
  reorderStripsWithinDay,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';

const CreateBody = z.object({
  sceneId: z.string().uuid(),
  orderIndex: z.number().int().min(0).max(2000).optional(),
  estMinutes: z.number().int().min(0).max(10000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const ReorderBody = z.object({
  orderedStripIds: z.array(z.string().uuid()).max(500),
});

interface Props {
  params: Promise<{ dayId: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dayId } = await params;
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const strip = await addStripToDay({
      shootingDayId: dayId,
      sceneId: parsed.data.sceneId,
      userId: user.userId,
      orderIndex: parsed.data.orderIndex,
      estMinutes: parsed.data.estMinutes ?? null,
      notes: parsed.data.notes ?? null,
    });
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.strip.create',
      payload: { stripId: strip.id, dayId, sceneId: parsed.data.sceneId },
    });
    return NextResponse.json({ strip }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add strip' },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dayId } = await params;
  const parsed = ReorderBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await reorderStripsWithinDay(dayId, user.userId, parsed.data.orderedStripIds);
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.strip.reorder',
      payload: { dayId, count: parsed.data.orderedStripIds.length },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reorder' },
      { status: 400 },
    );
  }
}
