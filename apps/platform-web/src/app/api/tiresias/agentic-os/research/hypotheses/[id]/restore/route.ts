/**
 * Research OS Phase 3 — hypothesis restore route.
 *
 * `POST /api/tiresias/agentic-os/research/hypotheses/:id/restore`
 *   Clear `archived_at`. Returns 404 when the hypothesis doesn't exist
 *   / isn't owned by this user; 400 when the hypothesis is already
 *   active (not archived). Audited as `research.hypothesis.restored`.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit, restoreHypothesis } from '@/lib/agentic-os/research/repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const outcome = await restoreHypothesis(id, user.userId);
  if (!outcome) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.alreadyActive) {
    return NextResponse.json(
      { error: 'Hypothesis is not archived', hypothesis: outcome.hypothesis },
      { status: 400 },
    );
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.hypothesis.restored',
    payload: { id },
  });

  return NextResponse.json({ hypothesis: outcome.hypothesis });
}
