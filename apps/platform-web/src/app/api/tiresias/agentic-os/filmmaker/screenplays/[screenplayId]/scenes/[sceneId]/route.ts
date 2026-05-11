/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/screenplays/[screenplayId]/scenes/[sceneId]
 *
 * GET — one scene.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { getScreenplayScene } from '@/lib/agentic-os/filmmaker/repo';

interface Props {
  params: Promise<{ screenplayId: string; sceneId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { screenplayId, sceneId } = await params;
  const scene = await getScreenplayScene(sceneId, user.userId);
  if (!scene || scene.screenplayId !== screenplayId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ scene });
}
