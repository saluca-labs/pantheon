/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/books/[id]/memories
 *
 * Convenience wrappers — equivalent to /memories?book_id=<id> (GET) and
 * /memories with book_id pre-set (POST).
 *
 * GET  — list memories attached to the book.
 * POST — create a memory pre-attached to the book. Audited.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getBook } from '@/lib/agentic-os/autobiographer/books-repo';
import {
  listMemoriesForBook,
  createMemory,
} from '@/lib/agentic-os/autobiographer/memories-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import {
  MEMORY_SOURCES,
  type MemorySource,
} from '@/lib/agentic-os/autobiographer/memories';

const MemoryBody = z.object({
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

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: bookId } = await params;

  // Cross-ownership check: the book must belong to the caller.
  const book = await getBook(bookId, user.userId);
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(request.url);
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');

  const memories = await listMemoriesForBook(bookId, user.userId, {
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return NextResponse.json({ memories });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: bookId } = await params;

  // Cross-ownership check first so we return 404 (not 400 from createMemory).
  const book = await getBook(bookId, user.userId);
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = MemoryBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const memory = await createMemory(user.userId, {
    bookId,
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
    payload: { memoryId: memory.id, bookId },
    projectId: bookId,
  });

  return NextResponse.json({ memory }, { status: 201 });
}
