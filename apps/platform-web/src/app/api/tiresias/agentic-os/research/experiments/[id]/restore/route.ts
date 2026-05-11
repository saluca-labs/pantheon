/**
 * Research OS — /api/tiresias/agentic-os/research/experiments/[id]/restore
 *
 * POST — clear `archived_at` and reset status to `planning` if it was
 *        `archived`. No-op for non-archived experiments. Audited.
 *
 * @license MIT — Tiresias Research OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import {
  getExperiment,
  restoreExperiment,
  recordAudit,
} from '@/lib/agentic-os/research/repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await getExperiment(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const experiment = await restoreExperiment(id, user.userId);
  if (!experiment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'research.experiment.restored',
    payload: { experimentId: id },
    projectId: id,
  });

  return NextResponse.json({ experiment });
}
