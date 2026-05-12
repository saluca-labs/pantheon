/**
 * Research OS Phase 3 — falsifiers collection route.
 *
 * `GET  /api/tiresias/agentic-os/research/hypotheses/:id/falsifiers`
 *   List falsifiers for the hypothesis (ascending by created_at).
 *
 * `POST /api/tiresias/agentic-os/research/hypotheses/:id/falsifiers`
 *   Create a new falsifier. Body: { text, criterionMd?, metadata? }.
 *
 * Audited as `research.falsifier.created`. 404 cross-tenant via the
 * hypothesis ownership probe.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import { isHypothesisOwnedByUser } from '@/lib/agentic-os/research/predictions-repo';
import {
  listFalsifiersForHypothesis,
  createFalsifier,
} from '@/lib/agentic-os/research/falsifiers-repo';

const CreateBody = z.object({
  text: z.string().min(1).max(2000),
  criterionMd: z.string().max(20_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: hypothesisId } = await params;
  const owned = await isHypothesisOwnedByUser(hypothesisId, user.userId);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const falsifiers = await listFalsifiersForHypothesis(hypothesisId, user.userId);
  return NextResponse.json({ falsifiers });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: hypothesisId } = await params;
  const owned = await isHypothesisOwnedByUser(hypothesisId, user.userId);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const falsifier = await createFalsifier(hypothesisId, user.userId, {
    text: d.text,
    criterionMd: d.criterionMd ?? null,
    metadata: d.metadata,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'research.falsifier.created',
    payload: { falsifierId: falsifier.id, hypothesisId },
  });

  return NextResponse.json({ falsifier }, { status: 201 });
}
