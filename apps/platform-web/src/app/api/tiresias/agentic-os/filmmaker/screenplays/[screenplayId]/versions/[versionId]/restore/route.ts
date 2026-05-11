/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/screenplays/[screenplayId]/versions/[versionId]/restore
 *
 * POST — copy the target version's fountain_text into a brand-new
 *        version and mark that new version as head.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getScreenplay,
  restoreScreenplayVersion,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';

interface Props {
  params: Promise<{ screenplayId: string; versionId: string }>;
}

export async function POST(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { screenplayId, versionId } = await params;
  const screenplay = await getScreenplay(screenplayId, user.userId);
  if (!screenplay) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await restoreScreenplayVersion(versionId, user.userId);
  if (!result || result.version.screenplayId !== screenplayId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.screenplay.restore',
    payload: {
      screenplayId,
      restoredFromVersionId: versionId,
      newVersionId: result.version.id,
      newVersionNumber: result.version.versionNumber,
    },
    projectId: screenplay.projectId,
  });

  return NextResponse.json({ version: result.version, scenes: result.scenes });
}
