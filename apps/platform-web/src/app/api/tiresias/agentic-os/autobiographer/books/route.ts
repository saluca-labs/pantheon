/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/books
 *
 * GET  — list user's books. Filters: ?status= ?tag=. Pagination ?limit= ?offset=.
 * POST — create a new book. Audited (action=autobiographer.book.created).
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  listBooks,
  createBook,
} from '@/lib/agentic-os/autobiographer/books-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import {
  BOOK_STATUSES,
  BOOK_PHASES,
  coerceBookPhaseProgress,
  type BookStatus,
} from '@/lib/agentic-os/autobiographer/books';

const PhaseProgressSchema = z
  .object(
    Object.fromEntries(
      BOOK_PHASES.map((k) => [k, z.number().min(0).max(100).optional()]),
    ),
  )
  .partial();

const BookBody = z.object({
  title: z.string().min(1).max(500),
  subtitle: z.string().max(500).nullable().optional(),
  coverImageUrl: z.string().url().max(2000).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(BOOK_STATUSES as unknown as [string, ...string[]]).optional(),
  targetCompletionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  targetAudience: z.string().max(500).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
  phaseProgress: PhaseProgressSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? undefined;
  const tag = url.searchParams.get('tag') ?? undefined;
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');

  if (status && !(BOOK_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `Invalid status: ${status}` },
      { status: 400 },
    );
  }

  const books = await listBooks({
    userId: user.userId,
    status: status as BookStatus | undefined,
    tag,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return NextResponse.json({ books });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = BookBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const book = await createBook(user.userId, {
    title: d.title,
    subtitle: d.subtitle ?? null,
    coverImageUrl: d.coverImageUrl ?? null,
    description: d.description ?? null,
    status: d.status as BookStatus | undefined,
    targetCompletionDate: d.targetCompletionDate ?? null,
    targetAudience: d.targetAudience ?? null,
    tags: d.tags,
    phaseProgress: d.phaseProgress
      ? coerceBookPhaseProgress(d.phaseProgress)
      : undefined,
    metadata: d.metadata,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.book.created',
    payload: { bookId: book.id },
    projectId: book.id,
  });

  return NextResponse.json({ book }, { status: 201 });
}
