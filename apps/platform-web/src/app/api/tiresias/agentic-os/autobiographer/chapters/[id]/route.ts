/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/chapters/[id]
 *
 * GET    — fetch one chapter by id (user-filtered).
 * PATCH  — edit title / slug / status / summary / target_word_count /
 *          position. `position` writes flow through the transactional
 *          `reorderChapter` so the DEFERRABLE UNIQUE on
 *          `(book_id, position)` is respected under swap.
 * DELETE — remove the chapter. CASCADE deletes revisions and source
 *          links via the migration 0045 FKs.
 *
 * Phase 6 seam: a future PATCH will accept a `sensitive_kinds` field.
 * The column does not yet exist; the route rejects unknown fields via
 * the Zod strict mode below.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  CHAPTER_STATUSES,
  CHAPTER_SLUG_MAX,
  CHAPTER_SUMMARY_MAX,
  CHAPTER_TITLE_MAX,
} from '@/lib/agentic-os/autobiographer/chapters';
import {
  deleteChapter,
  getChapter,
  reorderChapter,
  updateChapter,
  type UpdateChapterInput,
} from '@/lib/agentic-os/autobiographer/chapters-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const PatchBody = z
  .object({
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
    position: z.number().int().min(0).max(10_000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  // Phase 6 reserves `sensitive_kinds`; reject unknown fields so a
  // misconfigured client doesn't silently dead-letter.
  .strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const chapter = await getChapter(id, user.userId);
  if (!chapter) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ chapter });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getChapter(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // Route position writes through the transactional swap so we don't
  // violate the DEFERRABLE UNIQUE on (book_id, position).
  const positionChange =
    d.position !== undefined && d.position !== existing.position;

  try {
    if (positionChange) {
      const reordered = await reorderChapter(id, user.userId, d.position!);
      if (!reordered) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
    }

    // Build the non-position patch.
    const rest: Record<string, unknown> = { ...d };
    delete rest.position;

    let chapter = positionChange
      ? await getChapter(id, user.userId)
      : existing;

    if (Object.keys(rest).length > 0) {
      const updated = await updateChapter(id, user.userId, rest as UpdateChapterInput);
      if (!updated) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      chapter = updated;
    }

    const auditAction = positionChange && Object.keys(rest).length === 0
      ? 'autobiographer.chapter.reordered'
      : 'autobiographer.chapter.updated';

    await recordAudit({
      actorId: user.userId,
      action: auditAction,
      payload: {
        chapterId: id,
        bookId: existing.bookId,
        fields: Object.keys(d),
        ...(positionChange
          ? { from: existing.position, to: d.position }
          : {}),
      },
      projectId: existing.bookId,
    });

    return NextResponse.json({ chapter });
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === '23505') {
      return NextResponse.json(
        { error: 'slug already in use within this book' },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getChapter(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const removed = await deleteChapter(id, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.chapter.deleted',
    payload: { chapterId: id, bookId: existing.bookId },
    projectId: existing.bookId,
  });
  return NextResponse.json({ ok: true });
}
