/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/shooting-days/[dayId]
 *
 * GET    — full shooting day with joined strips.
 * PATCH  — update day metadata (date / call / unit / status / etc.).
 * DELETE — remove (cascades strips; scenes whose only strip was here
 *          flip back to unscheduled).
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getShootingDay,
  updateShootingDay,
  deleteShootingDay,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import {
  SHOOTING_UNIT_VALUES,
  SHOOTING_DAY_STATUS_VALUES,
} from '@/lib/agentic-os/filmmaker/schedule';

const PatchBody = z
  .object({
    shootDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    dayNumber: z.number().int().min(1).max(2000).optional(),
    label: z.string().max(200).optional().nullable(),
    callTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
    wrapTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
    unit: z.enum(SHOOTING_UNIT_VALUES).optional(),
    status: z.enum(SHOOTING_DAY_STATUS_VALUES).optional(),
    notes: z.string().max(4000).optional().nullable(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

interface Props {
  params: Promise<{ dayId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dayId } = await params;
  const day = await getShootingDay(dayId, user.userId);
  if (!day) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ day });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dayId } = await params;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const updated = await updateShootingDay({
      id: dayId,
      userId: user.userId,
      patch: parsed.data,
    });
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.shooting_day.update',
      payload: { dayId, patch: parsed.data },
      projectId: updated.projectId,
    });
    return NextResponse.json({ day: updated });
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

  const { dayId } = await params;
  const existing = await getShootingDay(dayId, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await deleteShootingDay(dayId, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.shooting_day.delete',
    payload: { dayId, projectId: existing.projectId },
    projectId: existing.projectId,
  });
  return NextResponse.json({ ok: true });
}
