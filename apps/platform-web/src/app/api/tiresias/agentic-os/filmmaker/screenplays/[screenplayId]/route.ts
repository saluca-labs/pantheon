/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/screenplays/[screenplayId]
 *
 * GET    — full screenplay + head version + scenes.
 * DELETE — remove the screenplay (and all versions/scenes via CASCADE).
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getScreenplay,
  getScreenplayVersion,
  listScreenplayScenes,
  deleteScreenplay,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';

interface Props {
  params: Promise<{ screenplayId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { screenplayId } = await params;
  const screenplay = await getScreenplay(screenplayId, user.userId);
  if (!screenplay) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const headVersion = screenplay.headVersionId
    ? await getScreenplayVersion(screenplay.headVersionId, user.userId)
    : null;
  const scenes = headVersion
    ? await listScreenplayScenes(headVersion.id, user.userId)
    : [];

  return NextResponse.json({ screenplay, headVersion, scenes });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { screenplayId } = await params;
  const screenplay = await getScreenplay(screenplayId, user.userId);
  if (!screenplay) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await deleteScreenplay(screenplayId, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.screenplay.delete',
    payload: { screenplayId, projectId: screenplay.projectId },
    projectId: screenplay.projectId,
  });

  return NextResponse.json({ ok: true });
}
