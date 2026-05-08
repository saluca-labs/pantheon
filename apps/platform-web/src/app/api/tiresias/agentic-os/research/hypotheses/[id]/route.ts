/**
 * Research OS — /api/tiresias/agentic-os/research/hypotheses/[id]
 *
 * PATCH — partial update (status, confidence, title, clauses, tags).
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { updateHypothesis, recordAudit } from '@/lib/agentic-os/research/repo';

const PatchBody = z.object({
  title: z.string().min(1).max(300).optional(),
  ifClause: z.string().min(1).max(1000).optional(),
  thenClause: z.string().min(1).max(1000).optional(),
  becauseClause: z.string().min(1).max(2000).optional(),
  status: z.enum(['draft', 'active', 'testing', 'supported', 'refuted', 'inconclusive', 'archived']).optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const hypothesis = await updateHypothesis(id, user.userId, parsed.data);
  if (!hypothesis) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({ actorId: user.userId, action: 'research.hypothesis.updated', payload: { id, fields: Object.keys(parsed.data) } });

  return NextResponse.json({ hypothesis });
}
