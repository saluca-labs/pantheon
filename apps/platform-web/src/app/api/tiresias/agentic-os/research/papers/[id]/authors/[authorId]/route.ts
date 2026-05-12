/**
 * Research OS Phase 4 — single paper-author link route.
 *
 * PATCH  /api/tiresias/agentic-os/research/papers/:id/authors/:authorId
 *   Change the link's `position`. Body: { position: number }. The
 *   transactional reorder swaps the displaced authors to keep
 *   positions contiguous. Audits research.paper.author.reordered.
 *
 * DELETE /api/tiresias/agentic-os/research/papers/:id/authors/:authorId
 *   Unlink the author from this paper. The author row itself is NOT
 *   deleted. Audits research.paper.author.unlinked.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  isPaperOwnedByUser,
  unlinkAuthor,
  reorderPaperAuthor,
} from '@/lib/agentic-os/research/paper-authors-repo';

const PatchBody = z.object({
  position: z.number().int().min(1).max(1000),
});

interface Props {
  params: Promise<{ id: string; authorId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: paperId, authorId } = await params;

  const owned = await isPaperOwnedByUser(paperId, user.userId);
  if (!owned) {
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

  const outcome = await reorderPaperAuthor(paperId, authorId, d.position, user.userId);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.kind === 'invalid_position') {
    return NextResponse.json(
      { error: 'Position out of range' },
      { status: 400 },
    );
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.paper.author.reordered',
    payload: { paperId, authorId, position: d.position },
  });

  return NextResponse.json({ ok: true, position: d.position });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: paperId, authorId } = await params;

  const owned = await isPaperOwnedByUser(paperId, user.userId);
  if (!owned) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const removed = await unlinkAuthor(paperId, authorId, user.userId);
  if (!removed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.paper.author.unlinked',
    payload: { paperId, authorId },
  });

  return NextResponse.json({ ok: true });
}
