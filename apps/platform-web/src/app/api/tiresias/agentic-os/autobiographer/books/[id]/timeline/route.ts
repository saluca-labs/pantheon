/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/books/[bookId]/timeline
 *
 * GET — composite timeline. Returns memories ordered by year-of-life
 *       (NULLS LAST) then `created_at ASC`, each with attached themes
 *       and arc memberships. Per-book by default; pass
 *       `?scope=workshop` to fold the entire user's memories in (no
 *       book filter). The route accepts the same filter query params
 *       the timeline page surfaces:
 *
 *         - theme_id (repeated; intersect semantics)
 *         - content_tag, emotion_tag
 *         - decade (integer, e.g. 1990)
 *         - person_id
 *         - sensitive (boolean)
 *         - limit, offset
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getBook } from '@/lib/agentic-os/autobiographer/books-repo';
import { listTimeline } from '@/lib/agentic-os/autobiographer/timeline';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: bookId } = await params;
  const url = request.nextUrl;
  const scope =
    (url.searchParams.get('scope') as 'workshop' | 'book' | null) ?? 'book';

  if (scope === 'book') {
    const book = await getBook(bookId, user.userId);
    if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const themeIds = url.searchParams.getAll('theme_id');
  const contentTag = url.searchParams.get('content_tag') ?? undefined;
  const emotionTag = url.searchParams.get('emotion_tag') ?? undefined;
  const decadeRaw = url.searchParams.get('decade');
  const decade =
    decadeRaw && /^[0-9]{4}$/.test(decadeRaw) ? Number(decadeRaw) : undefined;
  const personId = url.searchParams.get('person_id') ?? undefined;
  const sensitiveRaw = url.searchParams.get('sensitive');
  const isSensitive =
    sensitiveRaw === 'true' ? true : sensitiveRaw === 'false' ? false : undefined;
  const limit = Number(url.searchParams.get('limit') ?? 100);
  const offset = Number(url.searchParams.get('offset') ?? 0);

  const memories = await listTimeline({
    userId: user.userId,
    scope,
    bookId: scope === 'book' ? bookId : null,
    themeIds: themeIds.length > 0 ? themeIds : undefined,
    contentTag,
    emotionTag,
    decade,
    personId,
    isSensitive,
    limit: Number.isFinite(limit) ? limit : 100,
    offset: Number.isFinite(offset) ? offset : 0,
  });
  return NextResponse.json({ memories, scope });
}
