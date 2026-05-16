/**
 * Research OS Phase 3 — experiment → hypotheses link collection.
 *
 * `GET  /api/tiresias/agentic-os/research/experiments/:id/hypotheses`
 *   List linked hypotheses for the experiment. Each row returns
 *   `{ link, hypothesis }` so the UI can render the role pill + the
 *   underlying hypothesis in one pass.
 *
 * `POST /api/tiresias/agentic-os/research/experiments/:id/hypotheses`
 *   Link a hypothesis. Body: `{ hypothesis_id, role?, notes? }`.
 *   - 404 when the experiment doesn't belong to this user.
 *   - 404 when the hypothesis doesn't belong to this user (the other
 *     side of the cross-ownership guard).
 *   - 409 when the (experiment, hypothesis, role) triple already
 *     exists per the UNIQUE constraint.
 *   - Audited as `research.experiment.hypothesis.linked` with
 *     projectId = experimentId.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  isExperimentOwnedByUser,
  isHypothesisOwnedByUser,
  listLinkedHypothesesForExperiment,
  createLink,
} from '@/lib/agentic-os/research/experiment-hypotheses-repo';
import { LINK_ROLES, type LinkRole } from '@/lib/agentic-os/research/experiment-hypotheses';

const CreateBody = z.object({
  hypothesis_id: z.string().uuid(),
  role: z.enum(LINK_ROLES as unknown as [string, ...string[]]).optional(),
  notes: z.string().max(20_000).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: experimentId } = await params;
  const owned = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const linked = await listLinkedHypothesesForExperiment(experimentId, user.userId);
  return NextResponse.json({ linked });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: experimentId } = await params;

  // Experiment-side ownership.
  const expOwned = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!expOwned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  // Hypothesis-side ownership — the link table doesn't FK either side
  // for the experiment, but the hypothesis FK is cascade-on-delete and
  // ownership lives on the hypothesis row.
  const hypOwned = await isHypothesisOwnedByUser(parsed.data.hypothesis_id, user.userId);
  if (!hypOwned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const outcome = await createLink(experimentId, user.userId, {
    hypothesisId: parsed.data.hypothesis_id,
    role: parsed.data.role as LinkRole | undefined,
    notes: parsed.data.notes ?? null,
  });

  if (outcome.kind === 'duplicate') {
    return NextResponse.json(
      { error: 'Hypothesis already linked to this experiment with this role.' },
      { status: 409 },
    );
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.experiment.hypothesis.linked',
    payload: {
      linkId: outcome.link.id,
      experimentId,
      hypothesisId: outcome.link.hypothesisId,
      role: outcome.link.role,
    },
    projectId: experimentId,
  });

  return NextResponse.json({ link: outcome.link }, { status: 201 });
}
