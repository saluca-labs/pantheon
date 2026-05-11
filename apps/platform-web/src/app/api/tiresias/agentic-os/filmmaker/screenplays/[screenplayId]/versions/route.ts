/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/screenplays/[screenplayId]/versions
 *
 * GET  — list all versions, most recent first.
 * POST — save a new draft (fountain_text body). Parses fountain, replaces
 *        scenes, sets new version as head, clears prior head.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getScreenplay,
  listScreenplayVersions,
  saveDraftVersion,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';

const CreateBody = z.object({
  fountainText: z.string().max(2_000_000),
  label: z.string().min(1).max(200).optional(),
});

interface Props {
  params: Promise<{ screenplayId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { screenplayId } = await params;
  const screenplay = await getScreenplay(screenplayId, user.userId);
  if (!screenplay) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const versions = await listScreenplayVersions(screenplayId, user.userId);
  return NextResponse.json({ versions });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { screenplayId } = await params;
  const screenplay = await getScreenplay(screenplayId, user.userId);
  if (!screenplay) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await saveDraftVersion({
    screenplayId,
    userId: user.userId,
    fountainText: parsed.data.fountainText,
    label: parsed.data.label,
  });
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.screenplay.save_draft',
    payload: {
      screenplayId,
      versionId: result.version.id,
      versionNumber: result.version.versionNumber,
      wordCount: result.version.wordCount,
      sceneCount: result.scenes.length,
    },
    projectId: screenplay.projectId,
  });

  return NextResponse.json(
    { version: result.version, scenes: result.scenes },
    { status: 201 },
  );
}
