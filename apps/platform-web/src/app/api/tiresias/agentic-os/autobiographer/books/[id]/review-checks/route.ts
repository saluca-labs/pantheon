/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/books/[bookId]/review-checks
 *
 * GET  — list the book's review checks grouped by chapter
 *        (`{ book: [...], byChapterId: {...} }`).
 * POST — create a new check row. Book-level row when `chapterId` is
 *        absent / null; chapter-level otherwise. 404 when the book is
 *        foreign or the supplied chapter doesn't belong to the book.
 *        409 on duplicate `(book_id|chapter_id, kind)`.
 *
 * Slug naming note: this route uses `[id]` (destructured to `bookId`)
 * to avoid the Next.js sibling dynamic-route collision pattern documented
 * in `reference_nextjs_sibling_dynamic_route_collision.md`.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getBook } from '@/lib/agentic-os/autobiographer/books-repo';
import { getChapter } from '@/lib/agentic-os/autobiographer/chapters-repo';
import {
  createReviewCheck,
  listReviewChecksForBookGrouped,
} from '@/lib/agentic-os/autobiographer/review-checks-repo';
import {
  REVIEW_CHECK_KINDS,
  REVIEW_CHECK_NOTES_MAX,
  REVIEW_CHECK_STATUSES,
  type ReviewCheckKind,
  type ReviewCheckStatus,
} from '@/lib/agentic-os/autobiographer/review-checks';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const PostBody = z
  .object({
    chapterId: z.string().uuid().nullable().optional(),
    kind: z.enum(REVIEW_CHECK_KINDS as unknown as [string, ...string[]]),
    status: z
      .enum(REVIEW_CHECK_STATUSES as unknown as [string, ...string[]])
      .optional(),
    notes: z.string().max(REVIEW_CHECK_NOTES_MAX).nullable().optional(),
    checkedAt: z.string().datetime().nullable().optional(),
    checkedBy: z.string().uuid().nullable().optional(),
  })
  .strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: bookId } = await params;
  const book = await getBook(bookId, user.userId);
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const checks = await listReviewChecksForBookGrouped(bookId, user.userId);
  return NextResponse.json({ checks });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: bookId } = await params;
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

  // If a chapter is supplied, validate it belongs to the caller AND
  // to this book. Cross-tenant or cross-book chapter id → 404.
  if (d.chapterId) {
    const chapter = await getChapter(d.chapterId, user.userId);
    if (!chapter || chapter.bookId !== bookId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  try {
    const check = await createReviewCheck(user.userId, {
      bookId,
      chapterId: d.chapterId ?? null,
      kind: d.kind as ReviewCheckKind,
      status: d.status as ReviewCheckStatus | undefined,
      notes: d.notes ?? null,
      checkedAt: d.checkedAt ?? null,
      checkedBy: d.checkedBy ?? null,
    });
    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.review_check.created',
      payload: {
        checkId: check.id,
        bookId,
        chapterId: check.chapterId,
        kind: check.kind,
        status: check.status,
      },
      projectId: bookId,
    });
    return NextResponse.json({ check }, { status: 201 });
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === 'duplicate') {
      return NextResponse.json(
        { error: 'A review check of that kind already exists for this scope.' },
        { status: 409 },
      );
    }
    throw err;
  }
}
