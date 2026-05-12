/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/chapters/[id]/themes/[themeId]
 *
 * DELETE — unlink. 404 if either endpoint is missing/foreign.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getChapter } from '@/lib/agentic-os/autobiographer/chapters-repo';
import { unlinkThemeFromChapter } from '@/lib/agentic-os/autobiographer/chapter-themes-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

interface Props {
  params: Promise<{ id: string; themeId: string }>;
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: chapterId, themeId } = await params;
  try {
    const removed = await unlinkThemeFromChapter(chapterId, themeId, user.userId);
    if (!removed) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const chapter = await getChapter(chapterId, user.userId);
    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.chapter_theme.unlinked',
      payload: { chapterId, themeId },
      projectId: chapter?.bookId ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw err;
  }
}
