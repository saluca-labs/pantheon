/**
 * Research OS Phase 4 — experiment-references collection route.
 *
 * GET  /api/tiresias/agentic-os/research/experiments/:id/references
 *   Joined list: each row = { link, paper }.
 *
 * POST /api/tiresias/agentic-os/research/experiments/:id/references
 *   Link a paper to the experiment. Body:
 *     { paperId: UUID, relevance?: 'cites' | 'methods' | 'prior_art' |
 *       'contradicts' | 'builds_on', notes?: string }
 *   409 on duplicate (experiment_id, paper_id, relevance) — different
 *   relevance values for the same pair are allowed.
 *
 * Audit projectId = experimentId.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  isExperimentOwnedByUser,
  isPaperOwnedByUser,
  listReferencesForExperiment,
  createReference,
} from '@/lib/agentic-os/research/experiment-references-repo';
import { REFERENCE_RELEVANCES } from '@/lib/agentic-os/research/experiment-references';

const CreateBody = z.object({
  paperId: z.string().uuid(),
  relevance: z.enum(REFERENCE_RELEVANCES as unknown as [string, ...string[]]).optional(),
  notes: z.string().max(4000).nullable().optional(),
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
  const references = await listReferencesForExperiment(experimentId, user.userId);
  return NextResponse.json({ references });
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

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const ownsPaper = await isPaperOwnedByUser(d.paperId, user.userId);
  if (!ownsPaper) {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
  }

  const outcome = await createReference(experimentId, user.userId, {
    paperId: d.paperId,
    relevance: d.relevance as any,
    notes: d.notes ?? null,
  });

  if (outcome.kind === 'duplicate') {
    return NextResponse.json(
      {
        error: 'This experiment already links this paper with that relevance',
      },
      { status: 409 },
    );
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.experiment.reference.linked',
    payload: {
      experimentId,
      paperId: d.paperId,
      relevance: outcome.link.relevance,
    },
    projectId: experimentId,
  });

  return NextResponse.json({ link: outcome.link }, { status: 201 });
}
