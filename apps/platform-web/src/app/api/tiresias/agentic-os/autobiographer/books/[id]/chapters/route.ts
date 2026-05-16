/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/books/[id]/chapters
 *
 * GET  — list chapters in this book, ordered by `position` (Phase 5 will
 *        layer an arc-ordered alternative atop the same route).
 * POST — create a new chapter inside this book. Position is auto-
 *        assigned to `max(position) + 1`. Slug is auto-derived from
 *        title when not supplied; collisions are resolved by appending
 *        `-N`.
 *
 * Cross-ownership safety: the book must belong to the caller. A
 * foreign book id returns 404 with the same shape as a missing book
 * (no-existence-leak property).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getBook } from '@/lib/agentic-os/autobiographer/books-repo';
import {
  CHAPTER_STATUSES,
  CHAPTER_SLUG_MAX,
  CHAPTER_SUMMARY_MAX,
  CHAPTER_TITLE_MAX,
} from '@/lib/agentic-os/autobiographer/chapters';
import {
  createChapter,
  listChaptersForBook,
} from '@/lib/agentic-os/autobiographer/chapters-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const PostBody = z.object({
  title: z.string().max(CHAPTER_TITLE_MAX).nullable().optional(),
  slug: z
    .string()
    .min(1)
    .max(CHAPTER_SLUG_MAX)
    .regex(/^[a-z0-9-]+$/, 'slug must be kebab-case alphanumeric')
    .nullable()
    .optional(),
  status: z
    .enum(CHAPTER_STATUSES as unknown as [string, ...string[]])
    .optional(),
  summary: z.string().max(CHAPTER_SUMMARY_MAX).nullable().optional(),
  targetWordCount: z.number().int().min(0).max(10_000_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: bookId } = await params;
  const book = await getBook(bookId, user.userId);
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const chapters = await listChaptersForBook({
    userId: user.userId,
    bookId,
  });
  return NextResponse.json({ chapters });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: bookId } = await params;

  // Cross-ownership probe first — foreign book returns 404.
  const book = await getBook(bookId, user.userId);
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PostBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  try {
    const chapter = await createChapter(user.userId, {
      bookId,
      title: d.title ?? null,
      slug: d.slug ?? null,
      status: d.status as any,
      summary: d.summary ?? null,
      targetWordCount: d.targetWordCount ?? null,
      metadata: d.metadata,
    });
    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.chapter.created',
      payload: {
        chapterId: chapter.id,
        bookId,
        position: chapter.position,
        slug: chapter.slug,
      },
      projectId: bookId,
    });
    return NextResponse.json({ chapter }, { status: 201 });
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    // Slug collision (when caller supplied a slug): unique violation.
    if (errErr?.code === '23505') {
      return NextResponse.json(
        { error: 'slug already in use within this book' },
        { status: 409 },
      );
    }
    throw err;
  }
}
