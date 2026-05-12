/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/pseudonyms/[id]
 *
 * PATCH  — edit pseudonym / notes / applied. `applied` is typically
 *          flipped by the export layer; surfaced here for visibility
 *          and rare manual corrections.
 * DELETE — remove the row.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  deletePseudonym,
  getPseudonym,
  updatePseudonym,
} from '@/lib/agentic-os/autobiographer/pseudonyms-repo';
import {
  PSEUDONYM_NAME_MAX,
  PSEUDONYM_NOTES_MAX,
} from '@/lib/agentic-os/autobiographer/pseudonyms';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

// .strict() on PATCH for pseudonyms — the field set is bounded and
// any unknown key is a client bug.
const PatchBody = z
  .object({
    pseudonym: z.string().min(1).max(PSEUDONYM_NAME_MAX).optional(),
    notes: z.string().max(PSEUDONYM_NOTES_MAX).nullable().optional(),
    applied: z.boolean().optional(),
  })
  .strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await getPseudonym(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const pseudonym = await updatePseudonym(id, user.userId, d);
  if (!pseudonym) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Surface the dedicated audit action when the export layer flipped
  // `applied = true`. Otherwise the generic update action.
  const isAppliedFlip =
    Object.keys(d).length === 1 && d.applied === true && !existing.applied;
  await recordAudit({
    actorId: user.userId,
    action: isAppliedFlip
      ? 'autobiographer.pseudonym.applied'
      : 'autobiographer.pseudonym.updated',
    payload: {
      pseudonymId: id,
      bookId: existing.bookId,
      personId: existing.personId,
      fields: Object.keys(d),
    },
    projectId: existing.bookId,
  });
  return NextResponse.json({ pseudonym });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await getPseudonym(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await deletePseudonym(id, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.pseudonym.deleted',
    payload: {
      pseudonymId: id,
      bookId: existing.bookId,
      personId: existing.personId,
    },
    projectId: existing.bookId,
  });
  return NextResponse.json({ ok: true });
}
