/**
 * Research OS Phase 3 — single prediction route.
 *
 * `PATCH  /api/tiresias/agentic-os/research/predictions/:predId`
 *   Partial update (text / kind / confidence / metadata).
 *
 * `DELETE /api/tiresias/agentic-os/research/predictions/:predId`
 *   Hard delete (predictions are cheap; soft archive isn't needed).
 *
 * 404 on cross-tenant access (the underlying repo JOINs to the parent
 * hypothesis filtered by user_id). Audits `research.prediction.updated`
 * / `research.prediction.deleted`.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  getPrediction,
  updatePrediction,
  deletePrediction,
} from '@/lib/agentic-os/research/predictions-repo';
import { PREDICTION_KINDS, type PredictionKind } from '@/lib/agentic-os/research/predictions';

const PatchBody = z.object({
  text: z.string().min(1).max(2000).optional(),
  kind: z.enum(PREDICTION_KINDS as unknown as [string, ...string[]]).optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ predId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { predId } = await params;
  const existing = await getPrediction(predId, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const prediction = await updatePrediction(predId, user.userId, {
    text: d.text,
    kind: d.kind as PredictionKind | undefined,
    confidence: d.confidence,
    metadata: d.metadata,
  });
  if (!prediction) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'research.prediction.updated',
    payload: {
      predictionId: predId,
      hypothesisId: prediction.hypothesisId,
      fields: Object.keys(d),
    },
  });

  return NextResponse.json({ prediction });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { predId } = await params;
  const existing = await getPrediction(predId, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ok = await deletePrediction(predId, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'research.prediction.deleted',
    payload: {
      predictionId: predId,
      hypothesisId: existing.hypothesisId,
    },
  });

  return NextResponse.json({ ok: true });
}
