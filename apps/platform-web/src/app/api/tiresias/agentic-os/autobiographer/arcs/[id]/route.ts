/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/arcs/[id]
 *
 * GET    — fetch one arc by id (404 cross-tenant).
 * PATCH  — update title / kind / description / is_primary / metadata.
 *          Flipping is_primary=true atomically clears it on every other
 *          arc for the same book (single transaction).
 * DELETE — hard delete; CASCADE removes arc_chapters.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  deleteArc,
  getArc,
  updateArc,
  type UpdateArcInput,
} from '@/lib/agentic-os/autobiographer/arcs-repo';
import {
  ARC_DESCRIPTION_MAX,
  ARC_KINDS,
  ARC_TITLE_MAX,
} from '@/lib/agentic-os/autobiographer/arcs';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const PatchBody = z
  .object({
    title: z.string().min(1).max(ARC_TITLE_MAX).optional(),
    kind: z.enum(ARC_KINDS as unknown as [string, ...string[]]).optional(),
    description: z.string().max(ARC_DESCRIPTION_MAX).nullable().optional(),
    isPrimary: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const arc = await getArc(id, user.userId);
  if (!arc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ arc });
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
  const before = await getArc(id, user.userId);
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await updateArc(id, user.userId, parsed.data as UpdateArcInput);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.arc.updated',
    payload: { arcId: id, fields: Object.keys(parsed.data) },
    projectId: updated.bookId,
  });
  // Emit a dedicated "made_primary" audit event when the bit transitioned
  // from false → true so the timeline can highlight the moment.
  if (parsed.data.isPrimary === true && !before.isPrimary) {
    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.arc.made_primary',
      payload: { arcId: id, bookId: updated.bookId },
      projectId: updated.bookId,
    });
  }
  return NextResponse.json({ arc: updated });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const before = await getArc(id, user.userId);
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const removed = await deleteArc(id, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.arc.deleted',
    payload: { arcId: id },
    projectId: before.bookId,
  });
  return NextResponse.json({ ok: true });
}
