/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/[revId]
 *
 * GET    — fetch one revision (user-filtered).
 * PATCH  — edit body_text / citations / summary. `version`, `author`,
 *          and `coach_session_id` are immutable after insert.
 * DELETE — remove a single revision (CASCADE-safe; later revisions
 *          are unaffected).
 *
 * Phase 6 seam: PATCH will accept `sensitive_kinds` once Phase 6
 * ships. Zod strict mode rejects the field today; the seam is the
 * comment block + the strict() call.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getChapter } from '@/lib/agentic-os/autobiographer/chapters-repo';
import {
  REVISION_BODY_MAX,
  REVISION_CITATIONS_MAX,
  REVISION_SUMMARY_MAX,
} from '@/lib/agentic-os/autobiographer/chapter-revisions';
import {
  deleteRevision,
  getRevision,
  updateRevision,
} from '@/lib/agentic-os/autobiographer/chapter-revisions-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const CitationSchema = z.object({
  paragraph_index: z.number().int().min(0).max(100_000).optional(),
  paragraphIndex: z.number().int().min(0).max(100_000).optional(),
  memory_ids: z.array(z.string().uuid()).max(50).optional(),
  memoryIds: z.array(z.string().uuid()).max(50).optional(),
});

const PatchBody = z
  .object({
    bodyText: z.string().max(REVISION_BODY_MAX).optional(),
    summary: z.string().max(REVISION_SUMMARY_MAX).nullable().optional(),
    citations: z.array(CitationSchema).max(REVISION_CITATIONS_MAX).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  // Phase 6 reserves `sensitive_kinds`. Reject unknown fields so a
  // misconfigured client doesn't silently dead-letter.
  .strict();

interface Props {
  params: Promise<{ id: string; revId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: chapterId, revId } = await params;

  // Cross-ownership: the parent chapter must belong to the caller so a
  // revision id that belongs to a different user's chapter still 404s.
  const chapter = await getChapter(chapterId, user.userId);
  if (!chapter) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const revision = await getRevision(revId, user.userId);
  if (!revision || revision.chapterId !== chapterId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ revision });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: chapterId, revId } = await params;

  const chapter = await getChapter(chapterId, user.userId);
  if (!chapter) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const existing = await getRevision(revId, user.userId);
  if (!existing || existing.chapterId !== chapterId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const revision = await updateRevision(revId, user.userId, d as any);
  if (!revision) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.chapter_revision.updated',
    payload: {
      chapterId,
      bookId: chapter.bookId,
      revisionId: revId,
      version: revision.version,
      fields: Object.keys(d),
    },
    projectId: chapter.bookId,
  });

  return NextResponse.json({ revision });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: chapterId, revId } = await params;

  const chapter = await getChapter(chapterId, user.userId);
  if (!chapter) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const existing = await getRevision(revId, user.userId);
  if (!existing || existing.chapterId !== chapterId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const removed = await deleteRevision(revId, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.chapter_revision.deleted',
    payload: {
      chapterId,
      bookId: chapter.bookId,
      revisionId: revId,
      version: existing.version,
    },
    projectId: chapter.bookId,
  });

  return NextResponse.json({ ok: true });
}
