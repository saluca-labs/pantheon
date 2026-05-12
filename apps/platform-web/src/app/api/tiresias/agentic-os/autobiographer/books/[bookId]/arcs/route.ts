/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/books/[bookId]/arcs
 *
 * GET  — list arcs for the book (primary first, then created_at).
 * POST — create a new arc. 404 if book is foreign. When `isPrimary=true`
 *        is set, the partial UNIQUE invariant is preserved by the repo
 *        flipping every existing arc's bit to false inside a transaction.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getBook } from '@/lib/agentic-os/autobiographer/books-repo';
import {
  createArc,
  listArcsForBook,
} from '@/lib/agentic-os/autobiographer/arcs-repo';
import {
  ARC_DESCRIPTION_MAX,
  ARC_KINDS,
  ARC_TITLE_MAX,
} from '@/lib/agentic-os/autobiographer/arcs';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const PostBody = z
  .object({
    title: z.string().min(1).max(ARC_TITLE_MAX),
    kind: z.enum(ARC_KINDS as unknown as [string, ...string[]]).optional(),
    description: z.string().max(ARC_DESCRIPTION_MAX).nullable().optional(),
    isPrimary: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

interface Props {
  params: Promise<{ bookId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { bookId } = await params;
  const book = await getBook(bookId, user.userId);
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const arcs = await listArcsForBook(bookId, user.userId);
  return NextResponse.json({ arcs });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { bookId } = await params;
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
  const arc = await createArc(user.userId, {
    bookId,
    title: d.title,
    kind: d.kind as any,
    description: d.description ?? null,
    isPrimary: d.isPrimary ?? false,
    metadata: d.metadata,
  });
  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.arc.created',
    payload: {
      arcId: arc.id,
      bookId,
      kind: arc.kind,
      isPrimary: arc.isPrimary,
    },
    projectId: bookId,
  });
  return NextResponse.json({ arc }, { status: 201 });
}
