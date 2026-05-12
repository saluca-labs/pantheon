/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/arcs/[id]/chapters
 *
 * GET    — joined list of chapters in the arc, ordered by position.
 * POST   — attach a chapter. Body `{chapter_id, position?}`. Auto-
 *          positions to max(pos)+1 when omitted. 404 if arc/chapter is
 *          foreign or cross-book; 409 on duplicate link.
 * PATCH  — reorder via `{entries: [{chapter_id, position}, ...]}`.
 *          Single transaction with DEFERRABLE UNIQUE so intermediate
 *          same-position state never leaks.
 * DELETE — unlink via `?chapter_id=X`. 404 if missing.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getArc } from '@/lib/agentic-os/autobiographer/arcs-repo';
import {
  attachChapterToArc,
  listChaptersForArc,
  reorderArcChapters,
  unlinkChapterFromArc,
} from '@/lib/agentic-os/autobiographer/arc-chapters-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const AttachBody = z
  .object({
    chapter_id: z.string().uuid(),
    position: z.number().int().min(0).optional(),
  })
  .strict();

const ReorderBody = z
  .object({
    entries: z
      .array(
        z
          .object({
            chapter_id: z.string().uuid(),
            position: z.number().int().min(0),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: arcId } = await params;
  const arc = await getArc(arcId, user.userId);
  if (!arc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const chapters = await listChaptersForArc(arcId, user.userId);
  return NextResponse.json({ chapters });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: arcId } = await params;
  const parsed = AttachBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const row = await attachChapterToArc(arcId, user.userId, {
      chapterId: parsed.data.chapter_id,
      position: parsed.data.position ?? null,
    });
    const arc = await getArc(arcId, user.userId);
    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.arc_chapter.attached',
      payload: {
        arcId,
        chapterId: parsed.data.chapter_id,
        position: row.position,
      },
      projectId: arc?.bookId ?? null,
    });
    return NextResponse.json({ row }, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (err?.code === 'duplicate') {
      return NextResponse.json(
        { error: 'Chapter is already attached to this arc.' },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: arcId } = await params;
  const parsed = ReorderBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const chapters = await reorderArcChapters(
      arcId,
      user.userId,
      parsed.data.entries.map((e) => ({
        chapterId: e.chapter_id,
        position: e.position,
      })),
    );
    const arc = await getArc(arcId, user.userId);
    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.arc_chapter.reordered',
      payload: { arcId, count: parsed.data.entries.length },
      projectId: arc?.bookId ?? null,
    });
    return NextResponse.json({ chapters });
  } catch (err: any) {
    if (err?.code === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: arcId } = await params;
  const chapterId = request.nextUrl.searchParams.get('chapter_id');
  if (!chapterId) {
    return NextResponse.json(
      { error: 'chapter_id query parameter is required' },
      { status: 400 },
    );
  }
  try {
    const removed = await unlinkChapterFromArc(arcId, chapterId, user.userId);
    if (!removed) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const arc = await getArc(arcId, user.userId);
    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.arc_chapter.unlinked',
      payload: { arcId, chapterId },
      projectId: arc?.bookId ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw err;
  }
}
