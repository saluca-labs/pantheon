/**
 * Research OS Phase 6 — /api/tiresias/agentic-os/research/experiments/[id]/reproducibility
 *
 * GET  — returns `{ score, items, blocking_items, rollup }`. On first GET
 *        for an experiment, lazily seeds the 7 canonical item_keys as
 *        `state='pending'` (idempotent via ON CONFLICT DO NOTHING). The
 *        score is computed on read:
 *             score = done / (pending + in_progress + done)
 *        with `not_applicable` + `waived` excluded from the denominator.
 *        When the denominator is zero, `score` is null.
 * POST — create a new item. `item_key` is required and must match
 *        `^[a-z0-9_]+$` (max 60 chars). 409 on duplicate.
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
  seedCanonicalReproItems,
  listReproChecksForExperiment,
  createReproCheck,
  ReproDuplicateError,
} from '@/lib/agentic-os/research/reproducibility-repo';
import {
  REPRO_STATE_VALUES,
  computeReproRollup,
  blockingReproItems,
  validateReproItemKey,
  type CreateReproCheckInput,
} from '@/lib/agentic-os/research/reproducibility';

const STATE_ENUM = z.enum(
  REPRO_STATE_VALUES as unknown as [string, ...string[]],
);

const CreateBody = z.object({
  itemKey: z.string().min(1).max(60),
  state: STATE_ENUM.optional(),
  evidenceUrl: z.string().url().max(2000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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

  // Lazy seed canonical items (idempotent).
  await seedCanonicalReproItems(experimentId, user.userId);

  const items = await listReproChecksForExperiment(experimentId, user.userId);
  const rollup = computeReproRollup(items);
  const blocking = blockingReproItems(items);

  return NextResponse.json({
    score: rollup.score,
    rollup,
    items,
    blocking_items: blocking,
  });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: experimentId } = await params;

  const owned = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Regex validation (app-side; no DB CHECK on the value).
  const keyErr = validateReproItemKey(parsed.data.itemKey);
  if (keyErr) {
    return NextResponse.json({ error: keyErr }, { status: 400 });
  }

  try {
    const item = await createReproCheck(experimentId, user.userId, parsed.data as CreateReproCheckInput);
    await recordAudit({
      actorId: user.userId,
      action: 'research.reproducibility.item_added',
      payload: {
        experimentId,
        itemId: item.id,
        itemKey: item.itemKey,
      },
      projectId: experimentId,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof ReproDuplicateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create item' },
      { status: 400 },
    );
  }
}
