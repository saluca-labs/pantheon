/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/review-checks/[id]
 *
 * PATCH  — edit status / notes / checked_at / checked_by.
 * DELETE — remove the row.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  deleteReviewCheck,
  getReviewCheck,
  updateReviewCheck,
} from '@/lib/agentic-os/autobiographer/review-checks-repo';
import {
  REVIEW_CHECK_NOTES_MAX,
  REVIEW_CHECK_STATUSES,
  type ReviewCheckStatus,
} from '@/lib/agentic-os/autobiographer/review-checks';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const PatchBody = z
  .object({
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

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await getReviewCheck(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const check = await updateReviewCheck(id, user.userId, {
    status: d.status as ReviewCheckStatus | undefined,
    notes: d.notes,
    checkedAt: d.checkedAt,
    checkedBy: d.checkedBy,
  });
  if (!check) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.review_check.updated',
    payload: {
      checkId: id,
      bookId: existing.bookId,
      chapterId: existing.chapterId,
      kind: existing.kind,
      fields: Object.keys(d),
      ...(d.status !== undefined ? { status: d.status } : {}),
    },
    projectId: existing.bookId,
  });
  return NextResponse.json({ check });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await getReviewCheck(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await deleteReviewCheck(id, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.review_check.deleted',
    payload: {
      checkId: id,
      bookId: existing.bookId,
      chapterId: existing.chapterId,
      kind: existing.kind,
    },
    projectId: existing.bookId,
  });
  return NextResponse.json({ ok: true });
}
