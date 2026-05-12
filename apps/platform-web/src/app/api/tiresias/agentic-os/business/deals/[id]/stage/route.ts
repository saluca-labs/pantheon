/**
 * Business OS Phase 2 — deal stage transition convenience route.
 *
 * POST /api/tiresias/agentic-os/business/deals/[id]/stage
 *   Transition a deal between pipeline stages.  Sets closed_at=now()
 *   when moving to won/lost, clears it when reopening.
 *
 *   Audits:
 *     - `business.deal.stage_changed` (always)
 *     - `business.deal.won` when moving to won
 *     - `business.deal.lost` when moving to lost
 *     - `business.deal.reopened` when moving FROM won/lost back to open
 *
 *   Body: { stage: DealStage, lost_reason?: string | null }
 *
 * @license MIT — Tiresias Business OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getDeal,
  transitionDealStage,
} from '@/lib/agentic-os/business/deals-repo';
import { DEAL_STAGES } from '@/lib/agentic-os/business/deals';

const StageBody = z.object({
  stage: z.enum(DEAL_STAGES),
  lost_reason: z.string().max(500).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getDeal(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = StageBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const outcome = await transitionDealStage(id, user.userId, {
    stage: d.stage,
    lostReason: d.lost_reason ?? undefined,
  });

  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.kind === 'invalid_transition') {
    return NextResponse.json({ error: outcome.reason }, { status: 400 });
  }

  const from = existing.stage;
  const to = outcome.deal.stage;

  // Audit the generic stage change
  await recordAudit({
    actorId: user.userId,
    action: 'business.deal.stage_changed',
    payload: { dealId: id, from, to },
  });

  // Audit terminal stage events
  if (to === 'won') {
    await recordAudit({
      actorId: user.userId,
      action: 'business.deal.won',
      payload: { dealId: id, from },
    });
  } else if (to === 'lost') {
    await recordAudit({
      actorId: user.userId,
      action: 'business.deal.lost',
      payload: { dealId: id, from, lostReason: d.lost_reason },
    });
  }

  // Audit reopening
  if ((from === 'won' || from === 'lost') && to !== 'won' && to !== 'lost') {
    await recordAudit({
      actorId: user.userId,
      action: 'business.deal.reopened',
      payload: { dealId: id, from, to },
    });
  }

  return NextResponse.json({ deal: outcome.deal });
}
