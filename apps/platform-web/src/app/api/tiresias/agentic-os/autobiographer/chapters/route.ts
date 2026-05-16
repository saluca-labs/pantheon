import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  listChapters,
  createChapter,
  updateChapter,
  createEvent,
  recordAudit,
} from '@/lib/agentic-os/autobiographer/repo';
import {
  LEGACY_CHAPTER_STATUSES,
  EVENT_KINDS,
  type LegacyChapterStatus,
  type EventKind,
} from '@/lib/agentic-os/autobiographer/chapters';

// Legacy single-chapter editor endpoint. The Phase 4 book-scoped chapter
// CRUD lives at `/books/[bookId]/chapters` + `/chapters/[id]`; this route
// stays alive against `agos_autobiographer_chapters_legacy` (renamed by
// migration 0045) so the legacy editor remains functional for users with
// pre-Phase-4 data that has not been hand-migrated yet.
const ChapterBody = z.object({
  title: z.string().min(1).max(255),
  bodyText: z.string().max(200_000).default(''),
  periodLabel: z.string().max(100).nullable().optional(),
  status: z.enum(LEGACY_CHAPTER_STATUSES as unknown as [string, ...string[]]).optional(),
});

const EventBody = z.object({
  chapterId: z.string().uuid(),
  kind: z.enum(EVENT_KINDS as unknown as [string, ...string[]]),
  headline: z.string().min(1).max(255),
  detail: z.string().max(2000).nullable().optional(),
  occurredYear: z.number().int().min(1900).max(2100).nullable().optional(),
});

export async function GET() {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chapters = await listChapters(user.userId);
  return NextResponse.json({ chapters });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resource = request.nextUrl.searchParams.get('resource');

  if (resource === 'events') {
    // Create a life event
    const parsed = EventBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
    }
    const event = await createEvent({
      chapterId: parsed.data.chapterId,
      userId: user.userId,
      kind: parsed.data.kind as EventKind,
      headline: parsed.data.headline,
      detail: parsed.data.detail,
      occurredYear: parsed.data.occurredYear,
    });
    await recordAudit({ actorId: user.userId, action: 'autobiographer.event.created', payload: { eventId: event.id } });
    return NextResponse.json({ event }, { status: 201 });
  }

  // Default: create a chapter
  const parsed = ChapterBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }
  const chapter = await createChapter(user.userId, {
    title: parsed.data.title,
    bodyText: parsed.data.bodyText,
    periodLabel: parsed.data.periodLabel,
    status: parsed.data.status as LegacyChapterStatus | undefined,
  });
  await recordAudit({ actorId: user.userId, action: 'autobiographer.chapter.created', payload: { chapterId: chapter.id } });
  return NextResponse.json({ chapter }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const parsed = ChapterBody.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }
  const chapter = await updateChapter(id, {
    title: parsed.data.title,
    bodyText: parsed.data.bodyText,
    periodLabel: parsed.data.periodLabel,
    status: parsed.data.status as LegacyChapterStatus | undefined,
  });
  await recordAudit({ actorId: user.userId, action: 'autobiographer.chapter.updated', payload: { chapterId: id } });
  return NextResponse.json({ chapter });
}
