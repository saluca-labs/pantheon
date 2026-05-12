/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/chapters/[id]/lock
 *
 * POST — gate-then-flip. Computes the required review-check set for
 *        the chapter, looks up the chapter's checks, and returns 400
 *        with a shortfall body if any required check is not in
 *        `('passed','waived')`. On success: flips chapter.status to
 *        'locked', audits, and returns the updated chapter.
 *
 * The route also responds to `?unlock=true` by flipping the chapter
 * back to `'revised'` (no required-check gate; the author is the
 * authority). A separate audit action surfaces the unlock.
 *
 * Required-check rule (matches `chapters.computeRequiredCheckKinds`):
 *   - Always required: `consent_collected`, `attribution_verified`.
 *   - Conditional on `chapterHasSensitiveContent`: add `sensitive_flagged`.
 *
 * The shortfall body shape is stable so the UI modal can render
 * actionable links into the privacy hub:
 *   { error: 'lock_blocked',
 *     missing: [ { kind, status } ],
 *     required: [ ...required kinds ] }
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  chapterHasSensitiveContent,
  getChapter,
  setChapterStatus,
} from '@/lib/agentic-os/autobiographer/chapters-repo';
import { listReviewChecksForChapter } from '@/lib/agentic-os/autobiographer/review-checks-repo';
import { computeRequiredCheckKinds } from '@/lib/agentic-os/autobiographer/chapters';
import { SATISFIED_STATUSES } from '@/lib/agentic-os/autobiographer/review-checks';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: chapterId } = await params;
  const chapter = await getChapter(chapterId, user.userId);
  if (!chapter) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Unlock path — simple status flip, no gate. The author is the
  // authority over their own manuscript; the unlock route exists so
  // the locked state is reversible.
  const url = new URL(request.url);
  if (url.searchParams.get('unlock') === 'true') {
    const updated = await setChapterStatus(chapterId, user.userId, 'revised');
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.chapter.unlocked',
      payload: { chapterId, bookId: chapter.bookId },
      projectId: chapter.bookId,
    });
    return NextResponse.json({ chapter: updated });
  }

  // Lock path — compute requirements, fetch checks, evaluate shortfall.
  const hasSensitive = await chapterHasSensitiveContent(chapterId, user.userId);
  const required = computeRequiredCheckKinds({ hasSensitiveContent: hasSensitive });
  const checks = await listReviewChecksForChapter(chapterId, user.userId);

  const byKind = new Map<string, (typeof checks)[number]>();
  for (const c of checks) byKind.set(c.kind, c);

  const missing: Array<{ kind: string; status: string }> = [];
  for (const kind of required) {
    const row = byKind.get(kind);
    if (!row) {
      missing.push({ kind, status: 'missing' });
      continue;
    }
    if (
      !(SATISFIED_STATUSES as readonly string[]).includes(row.status)
    ) {
      missing.push({ kind, status: row.status });
    }
  }

  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: 'lock_blocked',
        message:
          'One or more required review checks are missing or unsatisfied. Open the privacy hub to resolve.',
        required,
        missing,
        hasSensitiveContent: hasSensitive,
      },
      { status: 400 },
    );
  }

  const updated = await setChapterStatus(chapterId, user.userId, 'locked');
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.chapter.locked',
    payload: {
      chapterId,
      bookId: chapter.bookId,
      required,
      hasSensitiveContent: hasSensitive,
    },
    projectId: chapter.bookId,
  });
  return NextResponse.json({ chapter: updated });
}
