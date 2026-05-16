import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { listShots, createShot, toggleShotCompleted, recordAudit } from '@/lib/agentic-os/filmmaker/repo';
import {
  SHOT_TYPES,
  CAMERA_MOVES,
  type ShotType,
  type CameraMove,
} from '@/lib/agentic-os/filmmaker/shots';

const ShotBody = z.object({
  sceneNumber: z.string().min(1).max(16),
  shotNumber: z.string().min(1).max(8),
  shotType: z.enum(SHOT_TYPES as unknown as [string, ...string[]]),
  cameraMove: z.enum(CAMERA_MOVES as unknown as [string, ...string[]]),
  subject: z.string().min(1).max(255),
  description: z.string().max(1000).optional().default(''),
  estimatedSeconds: z.number().int().min(0).max(3600).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const shots = await listShots(projectId);
  return NextResponse.json({ shots });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const parsed = ShotBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const shot = await createShot(projectId, {
    sceneNumber: parsed.data.sceneNumber,
    shotNumber: parsed.data.shotNumber,
    shotType: parsed.data.shotType as ShotType,
    cameraMove: parsed.data.cameraMove as CameraMove,
    subject: parsed.data.subject,
    description: parsed.data.description,
    estimatedSeconds: parsed.data.estimatedSeconds,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.shot.created',
    payload: { shotId: shot.id, sceneNumber: shot.sceneNumber, shotNumber: shot.shotNumber },
    projectId,
  });

  return NextResponse.json({ shot }, { status: 201 });
}

/** PATCH ?id=<shotId> — toggles completed flag */
export async function PATCH(request: NextRequest) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await toggleShotCompleted(id);
  await recordAudit({ actorId: user.userId, action: 'filmmaker.shot.toggled', payload: { shotId: id } });

  return NextResponse.json({ ok: true });
}
