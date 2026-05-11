/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects/[id]/storyboards
 *
 * GET  — list storyboards (summary) for the project.
 * POST — create a new storyboard.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  listStoryboards,
  createStoryboard,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import { STORYBOARD_STATUS_VALUES } from '@/lib/agentic-os/filmmaker/storyboards';

const CreateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional().nullable(),
  sceneId: z.string().uuid().optional().nullable(),
  status: z.enum(STORYBOARD_STATUS_VALUES).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const storyboards = await listStoryboards({ projectId: id, userId: user.userId });
  return NextResponse.json({ storyboards });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const storyboard = await createStoryboard({
      projectId: id,
      userId: user.userId,
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        sceneId: parsed.data.sceneId ?? null,
        status: parsed.data.status,
      },
    });
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.storyboard.create',
      payload: { storyboardId: storyboard.id, projectId: id },
      projectId: id,
    });
    return NextResponse.json({ storyboard }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create storyboard' },
      { status: 400 },
    );
  }
}
