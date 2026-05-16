/**
 * Research OS Phase 3 — predictions collection route.
 *
 * `GET  /api/tiresias/agentic-os/research/hypotheses/:id/predictions`
 *   List predictions for the hypothesis (ascending by created_at).
 *   404 when the hypothesis doesn't belong to this user.
 *
 * `POST /api/tiresias/agentic-os/research/hypotheses/:id/predictions`
 *   Create a new prediction. Body: { text, kind?, confidence?, metadata? }.
 *   404 cross-tenant; 400 on invalid body. Audited as
 *   `research.prediction.created`.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  isHypothesisOwnedByUser,
  listPredictionsForHypothesis,
  createPrediction,
} from '@/lib/agentic-os/research/predictions-repo';
import { PREDICTION_KINDS, type PredictionKind } from '@/lib/agentic-os/research/predictions';

const CreateBody = z.object({
  text: z.string().min(1).max(2000),
  kind: z.enum(PREDICTION_KINDS as unknown as [string, ...string[]]).optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
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

  const predictions = await listPredictionsForHypothesis(hypothesisId, user.userId);
  return NextResponse.json({ predictions });
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
  const prediction = await createPrediction(hypothesisId, user.userId, {
    text: d.text,
    kind: d.kind as PredictionKind | undefined,
    confidence: d.confidence,
    metadata: d.metadata,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'research.prediction.created',
    payload: { predictionId: prediction.id, hypothesisId },
  });

  return NextResponse.json({ prediction }, { status: 201 });
}
