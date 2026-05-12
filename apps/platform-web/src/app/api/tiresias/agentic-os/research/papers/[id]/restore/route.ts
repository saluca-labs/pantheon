/**
 * Research OS Phase 4 — paper restore route.
 *
 * POST /api/tiresias/agentic-os/research/papers/:id/restore
 *   Clear archived_at. 404 when the paper doesn't exist for this user;
 *   400 when the paper is already active. Audits research.paper.restored.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import { restorePaper } from '@/lib/agentic-os/research/papers-repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const outcome = await restorePaper(id, user.userId);
  if (outcome == null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.alreadyActive) {
    return NextResponse.json(
      { error: 'Paper is already active' },
      { status: 400 },
    );
  }
  await recordAudit({
    actorId: user.userId,
    action: 'research.paper.restored',
    payload: { paperId: id },
  });
  return NextResponse.json({ paper: outcome.paper });
}
