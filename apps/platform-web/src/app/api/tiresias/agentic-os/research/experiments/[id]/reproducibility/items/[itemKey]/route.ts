/**
 * Research OS Phase 6 —
 * /api/tiresias/agentic-os/research/experiments/[id]/reproducibility/items/[itemKey]
 *
 * PATCH  — update state / evidence_url / notes / metadata. Setting
 *          state='done' auto-stamps completed_at; setting state to any
 *          non-done value clears completed_at.
 * DELETE — hard-delete the item. Canonical items will be lazy-recreated
 *          on the next GET to /reproducibility.
 *
 * Cross-ownership: the (experiment, item_key) lookup joins to
 * `agos_research_experiments` filtered by user_id — 404 if either the
 * experiment or the item isn't owned by the caller.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  isExperimentOwnedByUser,
  getReproCheckByItemKey,
  updateReproCheckByItemKey,
  deleteReproCheckByItemKey,
} from '@/lib/agentic-os/research/reproducibility-repo';
import {
  REPRO_STATE_VALUES,
  validateReproItemKey,
  type UpdateReproCheckInput,
} from '@/lib/agentic-os/research/reproducibility';

const STATE_ENUM = z.enum(
  REPRO_STATE_VALUES as unknown as [string, ...string[]],
);

const PatchBody = z.object({
  state: STATE_ENUM.optional(),
  evidenceUrl: z.string().url().max(2000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string; itemKey: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: experimentId, itemKey } = await params;

  const keyErr = validateReproItemKey(itemKey);
  if (keyErr) return NextResponse.json({ error: keyErr }, { status: 400 });

  const owned = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = await getReproCheckByItemKey(experimentId, itemKey, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const item = await updateReproCheckByItemKey(
      experimentId,
      itemKey,
      user.userId,
      parsed.data as UpdateReproCheckInput,
    );
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await recordAudit({
      actorId: user.userId,
      action: 'research.reproducibility.item_updated',
      payload: { experimentId, itemKey, fields: Object.keys(parsed.data) },
      projectId: experimentId,
    });

    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update item' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: experimentId, itemKey } = await params;

  const keyErr = validateReproItemKey(itemKey);
  if (keyErr) return NextResponse.json({ error: keyErr }, { status: 400 });

  const owned = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = await getReproCheckByItemKey(experimentId, itemKey, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await deleteReproCheckByItemKey(experimentId, itemKey, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'research.reproducibility.item_deleted',
    payload: { experimentId, itemKey },
    projectId: experimentId,
  });

  return NextResponse.json({ ok: true });
}
