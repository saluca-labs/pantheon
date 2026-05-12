/**
 * Research OS Phase 4 — single experiment-reference link route.
 *
 * PATCH  /api/tiresias/agentic-os/research/experiments/:id/references/:paperId
 *   Change relevance or notes. Body: { relevance?, notes? }. 404 if no
 *   link with that pair exists for this user.
 *
 *   Note: a (experiment, paper) pair may have multiple link rows
 *   (different relevance values). PATCH operates on ALL rows for the
 *   pair — it's a per-pair contract. To switch from `cites` to
 *   `methods`, unlink the `cites` row first then create the `methods`
 *   link. Routes for finer-grain control are intentionally omitted in
 *   Phase 4 (would require carrying the link id in the path; the spec
 *   keeps the URL keyed on pair).
 *
 * DELETE /api/tiresias/agentic-os/research/experiments/:id/references/:paperId
 *   Unlink. Removes ALL relevance rows for the pair by default. Query
 *   ?relevance= optionally narrows the unlink to a single relevance.
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
  getReferenceByPair,
  updateReference,
  deleteReference,
} from '@/lib/agentic-os/research/experiment-references-repo';
import { REFERENCE_RELEVANCES } from '@/lib/agentic-os/research/experiment-references';

const PatchBody = z
  .object({
    relevance: z.enum(REFERENCE_RELEVANCES as unknown as [string, ...string[]]).optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .strict();

interface Props {
  params: Promise<{ id: string; paperId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: experimentId, paperId } = await params;

  const ownsExperiment = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!ownsExperiment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const ownsPaper = await isPaperOwnedByUser(paperId, user.userId);
  if (!ownsPaper) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const existing = await getReferenceByPair(experimentId, paperId, user.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  if (d.relevance === undefined && d.notes === undefined) {
    return NextResponse.json({ error: 'No patch fields supplied' }, { status: 400 });
  }

  const updated = await updateReference(experimentId, paperId, user.userId, {
    relevance: d.relevance as any,
    notes: d.notes ?? null,
  });
  if (!updated) {
    // updateReference returns null on either 404 or duplicate-after-switch;
    // a re-fetch tells us which. If pair still exists, treat as 409.
    const stillThere = await getReferenceByPair(experimentId, paperId, user.userId);
    if (stillThere) {
      return NextResponse.json(
        { error: 'Switching relevance would collide with an existing link' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.experiment.reference.updated',
    payload: {
      experimentId,
      paperId,
      relevance: updated.relevance,
    },
    projectId: experimentId,
  });

  return NextResponse.json({ link: updated });
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: experimentId, paperId } = await params;

  const ownsExperiment = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!ownsExperiment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const ownsPaper = await isPaperOwnedByUser(paperId, user.userId);
  if (!ownsPaper) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const relevanceParam = url.searchParams.get('relevance');
  if (
    relevanceParam &&
    !(REFERENCE_RELEVANCES as readonly string[]).includes(relevanceParam)
  ) {
    return NextResponse.json(
      { error: `Invalid relevance: ${relevanceParam}` },
      { status: 400 },
    );
  }

  const removed = await deleteReference(
    experimentId,
    paperId,
    user.userId,
    relevanceParam as any,
  );
  if (removed === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.experiment.reference.unlinked',
    payload: {
      experimentId,
      paperId,
      relevance: relevanceParam,
      removed,
    },
    projectId: experimentId,
  });

  return NextResponse.json({ ok: true, removed });
}
