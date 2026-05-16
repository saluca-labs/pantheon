/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/books/[bookId]/pseudonyms
 *
 * GET  — list pseudonyms for the book, joined with person canonical_name + aliases.
 * POST — create a pseudonym row. 404 when the book is foreign OR the
 *        person doesn't belong to the caller. 409 when (book_id, person_id)
 *        already has a row.
 *
 * Slug naming note: this route uses `[id]` as the URL segment to avoid
 * the Next.js sibling dynamic-route collision the codebase hit in
 * Phase 5 (reference memory `reference_nextjs_sibling_dynamic_route_collision`).
 * The slug is internally destructured to `bookId`.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getBook } from '@/lib/agentic-os/autobiographer/books-repo';
import {
  bookAndPersonBelongToUser,
  createPseudonym,
  listPseudonymsForBook,
} from '@/lib/agentic-os/autobiographer/pseudonyms-repo';
import {
  PSEUDONYM_NAME_MAX,
  PSEUDONYM_NOTES_MAX,
} from '@/lib/agentic-os/autobiographer/pseudonyms';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const PostBody = z
  .object({
    personId: z.string().uuid(),
    pseudonym: z.string().min(1).max(PSEUDONYM_NAME_MAX),
    notes: z.string().max(PSEUDONYM_NOTES_MAX).nullable().optional(),
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
  const pseudonyms = await listPseudonymsForBook(bookId, user.userId);
  return NextResponse.json({ pseudonyms });
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

  // Cross-ownership: the person MUST belong to the caller (the book
  // was already verified above).
  const ok = await bookAndPersonBelongToUser(bookId, d.personId, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const pseudonym = await createPseudonym(user.userId, {
      bookId,
      personId: d.personId,
      pseudonym: d.pseudonym,
      notes: d.notes ?? null,
    });
    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.pseudonym.created',
      payload: {
        pseudonymId: pseudonym.id,
        bookId,
        personId: d.personId,
      },
      projectId: bookId,
    });
    return NextResponse.json({ pseudonym }, { status: 201 });
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === 'duplicate') {
      return NextResponse.json(
        { error: 'A pseudonym already exists for this person in this book.' },
        { status: 409 },
      );
    }
    throw err;
  }
}
