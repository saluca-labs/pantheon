/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/chapters/[id]/themes
 *
 * GET  — list themes attached to the chapter.
 * POST — link a theme. 404 if either endpoint is missing/foreign; 409
 *        on duplicate link.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getChapter } from '@/lib/agentic-os/autobiographer/chapters-repo';
import {
  linkThemeToChapter,
  listThemesForChapter,
} from '@/lib/agentic-os/autobiographer/chapter-themes-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const LinkBody = z
  .object({
    themeId: z.string().uuid(),
  })
  .strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: chapterId } = await params;
  const chapter = await getChapter(chapterId, user.userId);
  if (!chapter) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const themes = await listThemesForChapter(chapterId, user.userId);
  return NextResponse.json({ themes });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: chapterId } = await params;
  const parsed = LinkBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const link = await linkThemeToChapter(
      chapterId,
      parsed.data.themeId,
      user.userId,
    );
    const chapter = await getChapter(chapterId, user.userId);
    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.chapter_theme.linked',
      payload: { chapterId, themeId: parsed.data.themeId },
      projectId: chapter?.bookId ?? null,
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (errErr?.code === 'duplicate') {
      return NextResponse.json(
        { error: 'Theme is already linked to this chapter.' },
        { status: 409 },
      );
    }
    throw err;
  }
}
