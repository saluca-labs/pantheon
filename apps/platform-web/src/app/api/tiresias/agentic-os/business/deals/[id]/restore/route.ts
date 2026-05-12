/**
 * Business OS Phase 2 — deal restore route.
 *
 * POST /api/tiresias/agentic-os/business/deals/[id]/restore
 *   Clear archived_at.  404 when the deal doesn't exist for this user;
 *   400 when the deal is already active.  Audits
 *   `business.deal.restored`.
 *
 * @license MIT — Tiresias Business OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { restoreDeal } from '@/lib/agentic-os/business/deals-repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const outcome = await restoreDeal(id, user.userId);
  if (outcome == null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (outcome.alreadyActive) {
    return NextResponse.json({ error: 'Deal is already active' }, { status: 400 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'business.deal.restored',
    payload: { dealId: id },
  });
  return NextResponse.json({ deal: outcome.deal });
}
