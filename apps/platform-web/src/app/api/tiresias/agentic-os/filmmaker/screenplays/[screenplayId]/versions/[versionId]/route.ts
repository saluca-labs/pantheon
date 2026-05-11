/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/screenplays/[screenplayId]/versions/[versionId]
 *
 * GET — full version + its scenes.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getScreenplayVersion,
  listScreenplayScenes,
} from '@/lib/agentic-os/filmmaker/repo';

interface Props {
  params: Promise<{ screenplayId: string; versionId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { screenplayId, versionId } = await params;
  const version = await getScreenplayVersion(versionId, user.userId);
  if (!version || version.screenplayId !== screenplayId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const scenes = await listScreenplayScenes(versionId, user.userId);
  return NextResponse.json({ version, scenes });
}
