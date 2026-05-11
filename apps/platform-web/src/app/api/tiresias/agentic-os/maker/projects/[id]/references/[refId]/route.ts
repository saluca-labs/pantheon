/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/references/[refId]
 *
 * PATCH  — update the join row (notes only).
 * DELETE — unlink reference from project (the reference itself is preserved
 *          in the workshop-global library).
 *
 * Auth + audit on every handler.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  updateProjectReferenceLink,
  detachReferenceFromProject,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';

const PatchBody = z.object({
  notes: z.string().max(8000).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string; refId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, refId } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const link = await updateProjectReferenceLink(projectId, refId, user.userId, {
      notes: parsed.data.notes,
    });
    if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.project.reference.updated',
      payload: { projectId, referenceId: refId, patch: parsed.data },
      projectId,
    });
    return NextResponse.json({ link });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed';
    const status = msg.toLowerCase().includes('not found') ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, refId } = await params;

  try {
    const ok = await detachReferenceFromProject(projectId, refId, user.userId);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.project.reference.unlinked',
      payload: { projectId, referenceId: refId },
      projectId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed';
    const status = msg.toLowerCase().includes('not found') ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
