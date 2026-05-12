/**
 * Research OS Phase 5 — experiment-protocols collection route.
 *
 * GET  /api/tiresias/agentic-os/research/experiments/:id/protocols
 *   Joined list: { link, protocol, resolved }. `resolved` is the
 *   protocol row whose `version` matches `pinned_version` (via the
 *   parent_protocol_id walker), falling back to the root.
 *
 * POST /api/tiresias/agentic-os/research/experiments/:id/protocols
 *   Pin a protocol to this experiment. Body:
 *     { protocolId: UUID, pinnedVersion?: string, notes?: string }
 *   If pinnedVersion omitted, defaults to the protocol's current version.
 *   409 on duplicate (experiment, protocol, pinned_version) triple.
 *
 * Audit projectId = experimentId.
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
  listProtocolsForExperiment,
  pinProtocolToExperiment,
} from '@/lib/agentic-os/research/experiment-protocols-repo';
import { validateProtocolVersion } from '@/lib/agentic-os/research/protocols';

const PinBody = z.object({
  protocolId: z.string().uuid(),
  pinnedVersion: z.string().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: experimentId } = await params;
  const owned = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!owned) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const pins = await listProtocolsForExperiment(experimentId, user.userId);
  return NextResponse.json({ pins });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: experimentId } = await params;
  const ownsExperiment = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!ownsExperiment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const parsed = PinBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  if (d.pinnedVersion !== undefined) {
    const err = validateProtocolVersion(d.pinnedVersion);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  const ownsProtocol = await isProtocolOwnedByUser(d.protocolId, user.userId);
  if (!ownsProtocol) {
    return NextResponse.json({ error: 'Protocol not found' }, { status: 404 });
  }

  const outcome = await pinProtocolToExperiment(experimentId, user.userId, {
    protocolId: d.protocolId,
    pinnedVersion: d.pinnedVersion?.trim(),
    notes: d.notes ?? null,
  });

  if (outcome.kind === 'duplicate') {
    return NextResponse.json(
      { error: 'This experiment already pins this protocol at that version' },
      { status: 409 },
    );
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.experiment.protocol.pinned',
    payload: {
      experimentId,
      protocolId: d.protocolId,
      pinnedVersion: outcome.link.pinnedVersion,
    },
    projectId: experimentId,
  });

  return NextResponse.json({ link: outcome.link }, { status: 201 });
}
