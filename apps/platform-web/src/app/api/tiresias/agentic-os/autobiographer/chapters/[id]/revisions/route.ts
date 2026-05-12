/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions
 *
 * GET  — list every revision for the chapter (version DESC).
 * POST — insert a new revision. `version` is auto-bumped to
 *        `max(existing) + 1` inside the INSERT. Body shape:
 *          { author: 'user' | 'coach',
 *            bodyText: string,
 *            summary?: string,
 *            citations?: [{paragraph_index, memory_ids[]}],
 *            coach_session_id?: uuid }
 *        Coach-authored revisions REQUIRE `coach_session_id`.
 *
 * Cross-ownership: the chapter must belong to the caller. Foreign
 * chapter id returns 404.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getChapter } from '@/lib/agentic-os/autobiographer/chapters-repo';
import {
  REVISION_AUTHORS,
  REVISION_BODY_MAX,
  REVISION_CITATIONS_MAX,
  REVISION_SUMMARY_MAX,
} from '@/lib/agentic-os/autobiographer/chapter-revisions';
import {
  insertRevision,
  listRevisionsForChapter,
} from '@/lib/agentic-os/autobiographer/chapter-revisions-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const CitationSchema = z.object({
  paragraph_index: z.number().int().min(0).max(100_000).optional(),
  paragraphIndex: z.number().int().min(0).max(100_000).optional(),
  memory_ids: z.array(z.string().uuid()).max(50).optional(),
  memoryIds: z.array(z.string().uuid()).max(50).optional(),
});

const PostBody = z.object({
  author: z.enum(REVISION_AUTHORS as unknown as [string, ...string[]]),
  bodyText: z.string().max(REVISION_BODY_MAX),
  summary: z.string().max(REVISION_SUMMARY_MAX).nullable().optional(),
  citations: z.array(CitationSchema).max(REVISION_CITATIONS_MAX).optional(),
  coach_session_id: z.string().uuid().nullable().optional(),
  coachSessionId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: chapterId } = await params;

  const chapter = await getChapter(chapterId, user.userId);
  if (!chapter) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const revisions = await listRevisionsForChapter(chapterId, user.userId);
  return NextResponse.json({ revisions });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: chapterId } = await params;

  const chapter = await getChapter(chapterId, user.userId);
  if (!chapter) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PostBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const coachSessionId = d.coach_session_id ?? d.coachSessionId ?? null;

  if (d.author === 'coach' && !coachSessionId) {
    return NextResponse.json(
      {
        error:
          'coach_session_id is required when author = "coach". Pass the Phase 7 session id.',
      },
      { status: 400 },
    );
  }

  const revision = await insertRevision(user.userId, {
    chapterId,
    author: d.author as any,
    bodyText: d.bodyText,
    summary: d.summary ?? null,
    citations: d.citations,
    coachSessionId,
    metadata: d.metadata,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.chapter_revision.created',
    payload: {
      chapterId,
      bookId: chapter.bookId,
      revisionId: revision.id,
      version: revision.version,
      author: revision.author,
      wordCount: revision.wordCount,
    },
    projectId: chapter.bookId,
  });

  return NextResponse.json({ revision }, { status: 201 });
}
