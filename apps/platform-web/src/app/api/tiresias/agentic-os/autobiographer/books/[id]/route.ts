/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/books/[id]
 *
 * GET    — fetch one book + memory count.
 * PATCH  — partial update of book metadata. Audited.
 * DELETE — soft-delete (status=archived) by default; ?hard=true issues
 *          a hard DELETE that detaches attached memories via the
 *          ON DELETE SET NULL FK on agos_autobiographer_memories.book_id.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  getBookWithCounts,
  updateBook,
  softDeleteBook,
  deleteBook,
  type UpdateBookInput,
} from '@/lib/agentic-os/autobiographer/books-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import {
  BOOK_STATUSES,
  BOOK_PHASES,
  coerceBookPhaseProgress,
} from '@/lib/agentic-os/autobiographer/books';

const PhaseProgressSchema = z
  .object(
    Object.fromEntries(
      BOOK_PHASES.map((k) => [k, z.number().min(0).max(100).optional()]),
    ),
  )
  .partial();

const PatchBody = z.object({
  title: z.string().min(1).max(500).optional(),
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

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const book = await getBookWithCounts(id, user.userId);
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ book });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const book = await updateBook(id, user.userId, {
    ...(d as UpdateBookInput),
    phaseProgress: d.phaseProgress
      ? coerceBookPhaseProgress(d.phaseProgress)
      : undefined,
  });
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.book.updated',
    payload: { bookId: id, fields: Object.keys(d) },
    projectId: id,
  });

  return NextResponse.json({ book });
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const url = new URL(request.url);
  const hard = url.searchParams.get('hard') === 'true';

  const removed = hard
    ? await deleteBook(id, user.userId)
    : await softDeleteBook(id, user.userId);
  if (!removed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: hard
      ? 'autobiographer.book.deleted'
      : 'autobiographer.book.archived',
    payload: { bookId: id, hard },
    projectId: id,
  });

  return NextResponse.json({ ok: true, mode: hard ? 'hard' : 'soft' });
}
