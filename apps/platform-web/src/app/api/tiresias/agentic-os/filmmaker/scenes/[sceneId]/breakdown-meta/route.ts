/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/scenes/[sceneId]/breakdown-meta
 *
 * GET   — fetch (auto-creates default row on first read).
 * PATCH — update eighths / complexity / status / notes.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getSceneBreakdownMeta,
  updateSceneBreakdownMeta,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import {
  SCENE_COMPLEXITY_VALUES,
  SCENE_STATUS_VALUES,
} from '@/lib/agentic-os/filmmaker/breakdown';

const PatchBody = z
  .object({
    eighths: z.number().int().min(0).max(2000).optional(),
    estShootMinutes: z.number().int().min(0).max(10000).optional().nullable(),
    notes: z.string().max(4000).optional().nullable(),
    complexity: z.enum(SCENE_COMPLEXITY_VALUES).optional().nullable(),
    status: z.enum(SCENE_STATUS_VALUES).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

interface Props {
  params: Promise<{ sceneId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sceneId } = await params;
  const meta = await getSceneBreakdownMeta(sceneId, user.userId);
  if (!meta) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ meta });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sceneId } = await params;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const updated = await updateSceneBreakdownMeta({
      sceneId,
      userId: user.userId,
      patch: parsed.data,
    });
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.scene_meta.update',
      payload: { sceneId, patch: parsed.data },
    });
    return NextResponse.json({ meta: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update' },
      { status: 400 },
    );
  }
}
