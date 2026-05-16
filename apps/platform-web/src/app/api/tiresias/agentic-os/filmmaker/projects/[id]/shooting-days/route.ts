/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects/[id]/shooting-days
 *
 * GET  — list shooting days for the project (optional ?unit= filter).
 * POST — create a new day. Auto-assigns next day_number if omitted.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  listShootingDays,
  createShootingDay,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import {
  SHOOTING_UNIT_VALUES,
  SHOOTING_DAY_STATUS_VALUES,
  type ShootingUnit,
} from '@/lib/agentic-os/filmmaker/schedule';

const CreateBody = z.object({
  shootDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dayNumber: z.number().int().min(1).max(2000).optional(),
  label: z.string().max(200).optional().nullable(),
  callTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  wrapTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  unit: z.enum(SHOOTING_UNIT_VALUES).optional(),
  status: z.enum(SHOOTING_DAY_STATUS_VALUES).optional(),
  notes: z.string().max(4000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const unit = request.nextUrl.searchParams.get('unit') ?? undefined;
  const days = await listShootingDays({
    projectId: id,
    userId: user.userId,
    unit: unit as ShootingUnit | undefined,
  });
  return NextResponse.json({ days });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const parsed = CreateBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const day = await createShootingDay({
      projectId: id,
      userId: user.userId,
      data: parsed.data,
    });
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.shooting_day.create',
      payload: { dayId: day.id, projectId: id, dayNumber: day.dayNumber, unit: day.unit },
      projectId: id,
    });
    return NextResponse.json({ day }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create day' },
      { status: 400 },
    );
  }
}
