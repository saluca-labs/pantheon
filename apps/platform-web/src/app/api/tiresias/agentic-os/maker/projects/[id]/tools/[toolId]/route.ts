/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/tools/[toolId]
 *
 * PATCH  — toggle `required` and/or update `notes` on the join row.
 * DELETE — unlink the tool from the project.
 *
 * Auth + audit on every handler.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  updateProjectToolLink,
  detachToolFromProject,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';

const PatchBody = z.object({
  required: z.boolean().optional(),
  notes: z.string().max(8000).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string; toolId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, toolId } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const link = await updateProjectToolLink(projectId, toolId, user.userId, {
      required: parsed.data.required,
      notes: parsed.data.notes,
    });
    if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.project.tool.updated',
      payload: { projectId, toolId, fields: Object.keys(parsed.data) },
      projectId,
    });
    return NextResponse.json({ link });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update link';
    const status = msg.toLowerCase().includes('not found') ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, toolId } = await params;
  try {
    const removed = await detachToolFromProject(projectId, toolId, user.userId);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.project.tool.detached',
      payload: { projectId, toolId },
      projectId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to detach';
    const status = msg.toLowerCase().includes('not found') ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
