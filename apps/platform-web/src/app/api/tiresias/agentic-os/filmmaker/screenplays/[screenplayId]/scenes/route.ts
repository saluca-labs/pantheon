/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/screenplays/[screenplayId]/scenes
 *
 * GET — list scenes for the head version of the screenplay.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getScreenplay,
  listScreenplayScenes,
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
  if (!screenplay.headVersionId) return NextResponse.json({ scenes: [] });

  const scenes = await listScreenplayScenes(screenplay.headVersionId, user.userId);
  return NextResponse.json({ scenes });
}
