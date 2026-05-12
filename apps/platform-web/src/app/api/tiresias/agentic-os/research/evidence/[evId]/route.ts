/**
 * Research OS Phase 3 — single evidence row route.
 *
 * `DELETE /api/tiresias/agentic-os/research/evidence/:evId`
 *   Hard delete the evidence row. No PATCH — evidence is append-or-
 *   delete only; re-linking means delete + recreate.
 *
 * Audited as `research.evidence.unlinked`.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import { getEvidence, deleteEvidence } from '@/lib/agentic-os/research/evidence-repo';

interface Props {
  params: Promise<{ evId: string }>;
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { evId } = await params;
  const existing = await getEvidence(evId, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ok = await deleteEvidence(evId, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'research.evidence.unlinked',
    payload: {
      evidenceId: evId,
      hypothesisId: existing.hypothesisId,
      polarity: existing.polarity,
      sourceKind: existing.sourceKind,
    },
  });

  return NextResponse.json({ ok: true });
}
