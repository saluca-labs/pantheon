/**
 * Research OS — /api/tiresias/agentic-os/research/hypotheses
 *
 * GET  — list all hypotheses for the authenticated user.
 * POST — create a new hypothesis.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { listHypotheses, createHypothesis, recordAudit } from '@/lib/agentic-os/research/repo';

const HypothesisBody = z.object({
  title: z.string().min(1).max(300),
  ifClause: z.string().min(1).max(1000),
  thenClause: z.string().min(1).max(1000),
  becauseClause: z.string().min(1).max(2000),
  status: z.enum(['draft', 'active', 'testing', 'supported', 'refuted', 'inconclusive', 'archived']).optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
});

export async function GET() {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const hypotheses = await listHypotheses(user.userId);
  return NextResponse.json({ hypotheses });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = HypothesisBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const hypothesis = await createHypothesis(user.userId, parsed.data);
  await recordAudit({ actorId: user.userId, action: 'research.hypothesis.created', payload: { id: hypothesis.id } });

  return NextResponse.json({ hypothesis }, { status: 201 });
}
