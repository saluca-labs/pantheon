/**
 * Research OS Phase 5 — single experiment-protocol pin route.
 *
 * PATCH  /api/tiresias/.../experiments/:id/protocols/:protocolId
 *   Notes-only. Pin is IMMUTABLE — to repin at a different version,
 *   unpin then repin.
 * DELETE /api/tiresias/.../experiments/:id/protocols/:protocolId
 *   Unpin all rows of the (experiment, protocol) pair across every
 *   pinned_version.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  isExperimentOwnedByUser,
  isProtocolOwnedByUser,
  getExperimentProtocolLink,
  updateExperimentProtocolNotes,
  unpinProtocolFromExperiment,
} from '@/lib/agentic-os/research/experiment-protocols-repo';

const PatchBody = z.object({
  notes: z.string().max(2000).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string; protocolId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: experimentId, protocolId } = await params;

  const ownsExperiment = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!ownsExperiment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const ownsProtocol = await isProtocolOwnedByUser(protocolId, user.userId);
  if (!ownsProtocol) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const link = await getExperimentProtocolLink(experimentId, protocolId, user.userId);
  if (!link) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const next = await updateExperimentProtocolNotes(
    experimentId,
    protocolId,
    user.userId,
    { notes: parsed.data.notes ?? null },
  );
  if (!next) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.experiment.protocol.updated',
    payload: { experimentId, protocolId },
    projectId: experimentId,
  });

  return NextResponse.json({ link: next });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: experimentId, protocolId } = await params;

  const ownsExperiment = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!ownsExperiment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const ownsProtocol = await isProtocolOwnedByUser(protocolId, user.userId);
  if (!ownsProtocol) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const removed = await unpinProtocolFromExperiment(
    experimentId,
    protocolId,
    user.userId,
  );
  if (removed === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.experiment.protocol.unpinned',
    payload: { experimentId, protocolId, removedCount: removed },
    projectId: experimentId,
  });
  return NextResponse.json({ ok: true, removed });
}
