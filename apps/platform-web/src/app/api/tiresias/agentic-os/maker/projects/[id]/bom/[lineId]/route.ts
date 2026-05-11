/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/bom/[lineId]
 *
 * PATCH  — partial update of a single BOM line.
 * DELETE — remove a single BOM line.
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  updateBomLine,
  deleteBomLine,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import { BOM_PRIORITY_VALUES } from '@/lib/agentic-os/maker/bom';

const PatchBody = z.object({
  variantId: z.string().uuid().nullable().optional(),
  quantityNeeded: z.number().positive().optional(),
  notes: z.string().max(2000).nullable().optional(),
  priority: z.enum(BOM_PRIORITY_VALUES as unknown as [string, ...string[]]).optional(),
});

interface Props {
  params: Promise<{ id: string; lineId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, lineId } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const line = await updateBomLine(lineId, projectId, user.userId, parsed.data as any);
    if (!line) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.bom_line.updated',
      payload: { projectId, lineId, fields: Object.keys(parsed.data) },
      projectId,
    });
    return NextResponse.json({ line });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update BOM line' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, lineId } = await params;
  try {
    const removed = await deleteBomLine(lineId, projectId, user.userId);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.bom_line.deleted',
      payload: { projectId, lineId },
      projectId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 400 },
    );
  }
}
