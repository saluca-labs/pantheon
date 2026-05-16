/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/chapters/[id]/sources
 *
 * GET    — list sources joined with the source memory's display fields
 *          (title, when_in_life) and a paragraph-citation count from
 *          the latest revision.
 * POST   — link a memory to this chapter. Body:
 *            { memory_id: uuid, weight?: number, notes?: string }
 *          Returns 409 on duplicate link.
 * DELETE — unlink a single memory: `?memory_id=<uuid>`.
 *
 * Cross-ownership: the chapter and the memory must both belong to the
 * caller — foreign id returns 404 with the same shape as a missing
 * row (no-existence-leak property).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getChapter } from '@/lib/agentic-os/autobiographer/chapters-repo';
import { getMemory } from '@/lib/agentic-os/autobiographer/memories-repo';
import {
  SOURCE_NOTES_MAX,
  SOURCE_WEIGHT_MAX,
  SOURCE_WEIGHT_MIN,
} from '@/lib/agentic-os/autobiographer/chapter-sources';
import {
  linkChapterSource,
  listSourcesForChapter,
  unlinkChapterSource,
} from '@/lib/agentic-os/autobiographer/chapter-sources-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const PostBody = z.object({
  memory_id: z.string().uuid().optional(),
  memoryId: z.string().uuid().optional(),
  weight: z.number().min(SOURCE_WEIGHT_MIN).max(SOURCE_WEIGHT_MAX).optional(),
  notes: z.string().max(SOURCE_NOTES_MAX).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: chapterId } = await params;
  const chapter = await getChapter(chapterId, user.userId);
  if (!chapter) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sources = await listSourcesForChapter(chapterId, user.userId);
  return NextResponse.json({ sources });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: chapterId } = await params;

  const chapter = await getChapter(chapterId, user.userId);
  if (!chapter) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PostBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const memoryId = d.memory_id ?? d.memoryId;
  if (!memoryId) {
    return NextResponse.json(
      { error: 'memory_id is required' },
      { status: 400 },
    );
  }

  // Cross-ownership: confirm the memory belongs to the caller. A
  // foreign memory id returns 404 — same shape as a missing memory.
  const memory = await getMemory(memoryId, user.userId);
  if (!memory) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const source = await linkChapterSource({
      chapterId,
      memoryId,
      weight: d.weight,
      notes: d.notes ?? null,
    });

    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.chapter_source.linked',
      payload: {
        chapterId,
        bookId: chapter.bookId,
        memoryId,
        weight: source.weight,
      },
      projectId: chapter.bookId,
    });

    return NextResponse.json({ source }, { status: 201 });
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === '23505') {
      return NextResponse.json(
        { error: 'this memory is already linked to this chapter' },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: chapterId } = await params;

  const url = new URL(request.url);
  const memoryId = url.searchParams.get('memory_id');
  if (!memoryId) {
    return NextResponse.json(
      { error: 'memory_id query param is required' },
      { status: 400 },
    );
  }

  const chapter = await getChapter(chapterId, user.userId);
  if (!chapter) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await unlinkChapterSource(chapterId, memoryId, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.chapter_source.unlinked',
    payload: {
      chapterId,
      bookId: chapter.bookId,
      memoryId,
    },
    projectId: chapter.bookId,
  });

  return NextResponse.json({ ok: true });
}
