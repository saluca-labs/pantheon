/**
 * Research OS — /api/tiresias/agentic-os/research/hypotheses/[id]
 *
 * GET   — fetch one hypothesis. 404 cross-tenant.
 * PATCH — partial update (status, confidence, title, clauses, tags,
 *         description_md, archived). When `archived=true` is supplied
 *         the call delegates to `archiveHypothesis` (sets archived_at)
 *         and audits `research.hypothesis.archived`. When `archived=false`
 *         the route 400s and points at POST /restore — explicit reverse
 *         path keeps the audit trail clean.
 *         When `status` is patched, audits `research.hypothesis.status_changed`
 *         IN ADDITION to `research.hypothesis.updated`.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import {
  getHypothesis,
  updateHypothesis,
  archiveHypothesis,
  recordAudit,
} from '@/lib/agentic-os/research/repo';

const PatchBody = z.object({
  title: z.string().min(1).max(300).optional(),
  ifClause: z.string().min(1).max(1000).optional(),
  thenClause: z.string().min(1).max(1000).optional(),
  becauseClause: z.string().min(1).max(2000).optional(),
  status: z.enum(['draft', 'active', 'testing', 'supported', 'refuted', 'inconclusive', 'archived']).optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
  descriptionMd: z.string().max(20_000).optional(),
  archived: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const hypothesis = await getHypothesis(id, user.userId);
  if (!hypothesis) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ hypothesis });
}

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

  // Reject explicit `archived: false` here — clients must use POST /restore.
  if (parsed.data.archived === false) {
    return NextResponse.json(
      { error: 'Use POST /api/tiresias/agentic-os/research/hypotheses/[id]/restore to un-archive.' },
      { status: 400 },
    );
  }

  // 404 first — keeps the audit trail honest.
  const existing = await getHypothesis(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // `archived: true` is the archive path — handled separately so the
  // audit fires `research.hypothesis.archived` instead of `.updated`.
  if (parsed.data.archived === true) {
    const archived = await archiveHypothesis(id, user.userId);
    if (!archived) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'research.hypothesis.archived',
      payload: { id },
    });
    return NextResponse.json({ hypothesis: archived });
  }

  // Strip the `archived` key so the upsert helper doesn't see it.
  const { archived: _ignored, ...patch } = parsed.data;

  const hypothesis = await updateHypothesis(id, user.userId, patch);
  if (!hypothesis) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const fields = Object.keys(patch);
  await recordAudit({
    actorId: user.userId,
    action: 'research.hypothesis.updated',
    payload: { id, fields },
  });

  // Phase 3: status changes get a second, dedicated audit row so dashboards
  // can filter status transitions without parsing the `fields` array.
  if (patch.status !== undefined && patch.status !== existing.status) {
    await recordAudit({
      actorId: user.userId,
      action: 'research.hypothesis.status_changed',
      payload: { id, from: existing.status, to: patch.status },
    });
  }

  return NextResponse.json({ hypothesis });
}
