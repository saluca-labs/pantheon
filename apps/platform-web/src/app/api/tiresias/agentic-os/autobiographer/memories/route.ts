/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/memories
 *
 * GET  — workshop-global list. Filters: ?book_id= ?content_tag= ?emotion_tag=
 *        ?is_sensitive= ?era_after= ?era_before=. Paginated ?limit= ?offset=.
 * POST — create a memory. Audited. If body_id is supplied, ownership of
 *        the referenced book is validated by the repo (404 on mismatch).
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  listMemories,
  createMemory,
} from '@/lib/agentic-os/autobiographer/memories-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import {
  MEMORY_SOURCES,
  type MemorySource,
} from '@/lib/agentic-os/autobiographer/memories';

const MemoryBody = z.object({
  bookId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(500),
  bodyMarkdown: z.string().min(1).max(200_000),
  transcript: z.string().max(500_000).nullable().optional(),
  audioUrl: z.string().url().max(2000).nullable().optional(),
  photoUrls: z.array(z.string().url().max(2000)).max(20).optional(),
  whenInLife: z.string().max(500).nullable().optional(),
  eraDateEstimate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  location: z.string().max(500).nullable().optional(),
  emotionTags: z.array(z.string().min(1).max(60)).max(30).optional(),
  contentTags: z.array(z.string().min(1).max(60)).max(30).optional(),
  isSensitive: z.boolean().optional(),
  source: z.enum(MEMORY_SOURCES as unknown as [string, ...string[]]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const bookIdParam = url.searchParams.get('book_id');
  const contentTag = url.searchParams.get('content_tag') ?? undefined;
  const emotionTag = url.searchParams.get('emotion_tag') ?? undefined;
  const isSensitiveParam = url.searchParams.get('is_sensitive');
  const eraAfter = url.searchParams.get('era_after') ?? undefined;
  const eraBefore = url.searchParams.get('era_before') ?? undefined;
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');

  // bookId: explicit "null" string filters for workshop-global memories;
  // a UUID filters to that book; absence leaves the dimension unfiltered.
  let bookId: string | null | undefined;
  if (bookIdParam === 'null') bookId = null;
  else if (bookIdParam) bookId = bookIdParam;

  let isSensitive: boolean | undefined;
  if (isSensitiveParam === 'true') isSensitive = true;
  else if (isSensitiveParam === 'false') isSensitive = false;

  const memories = await listMemories({
    userId: user.userId,
    bookId,
    contentTag,
    emotionTag,
    isSensitive,
    eraAfter,
    eraBefore,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return NextResponse.json({ memories });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = MemoryBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  try {
    const memory = await createMemory(user.userId, {
      bookId: d.bookId ?? null,
      title: d.title,
      bodyMarkdown: d.bodyMarkdown,
      transcript: d.transcript ?? null,
      audioUrl: d.audioUrl ?? null,
      photoUrls: d.photoUrls,
      whenInLife: d.whenInLife ?? null,
      eraDateEstimate: d.eraDateEstimate ?? null,
      location: d.location ?? null,
      emotionTags: d.emotionTags,
      contentTags: d.contentTags,
      isSensitive: d.isSensitive,
      source: d.source as MemorySource | undefined,
      metadata: d.metadata,
    });

    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.memory.created',
      payload: { memoryId: memory.id, bookId: memory.bookId },
      projectId: memory.bookId ?? null,
    });

    return NextResponse.json({ memory }, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'book_not_found') {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }
    throw err;
  }
}
