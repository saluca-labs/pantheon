/**
 * Research OS Phase 3 — single falsifier route.
 *
 * `PATCH  /api/tiresias/agentic-os/research/falsifiers/:falsId`
 *   Partial update (text / criterionMd / metadata).
 *
 * `DELETE /api/tiresias/agentic-os/research/falsifiers/:falsId`
 *   Hard delete.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  getFalsifier,
  updateFalsifier,
  deleteFalsifier,
} from '@/lib/agentic-os/research/falsifiers-repo';

const PatchBody = z.object({
  text: z.string().min(1).max(2000).optional(),
  criterionMd: z.string().max(20_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ falsId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { falsId } = await params;
  const existing = await getFalsifier(falsId, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const falsifier = await updateFalsifier(falsId, user.userId, {
    text: d.text,
    criterionMd: d.criterionMd === undefined ? undefined : d.criterionMd,
    metadata: d.metadata,
  });
  if (!falsifier) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'research.falsifier.updated',
    payload: {
      falsifierId: falsId,
      hypothesisId: falsifier.hypothesisId,
      fields: Object.keys(d),
    },
  });

  return NextResponse.json({ falsifier });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { falsId } = await params;
  const existing = await getFalsifier(falsId, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ok = await deleteFalsifier(falsId, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'research.falsifier.deleted',
    payload: {
      falsifierId: falsId,
      hypothesisId: existing.hypothesisId,
    },
  });

  return NextResponse.json({ ok: true });
}
