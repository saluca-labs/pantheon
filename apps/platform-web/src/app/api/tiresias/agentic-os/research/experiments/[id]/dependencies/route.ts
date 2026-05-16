/**
 * Research OS Phase 6 — /api/tiresias/agentic-os/research/experiments/[id]/dependencies
 *
 * GET  — returns BOTH `upstream` (edges from→this) and `downstream`
 *        (edges this→to), with peer experiment metadata.
 * POST — create a directed dependency edge from this experiment to the
 *        specified `toExperimentId`. Validates self-loop, cross-ownership
 *        (404 either side), and duplicate edges (409).
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
  listDependenciesForExperiment,
  createDependency,
  DependencyDuplicateError,
  DependencyCrossOwnershipError,
  DependencySelfLoopError,
} from '@/lib/agentic-os/research/dependencies-repo';
import { DEPENDENCY_KIND_VALUES, type DependencyKind } from '@/lib/agentic-os/research/dependencies';

const KIND_ENUM = z.enum(
  DEPENDENCY_KIND_VALUES as unknown as [string, ...string[]],
);

const CreateBody = z.object({
  toExperimentId: z.string().uuid(),
  kind: KIND_ENUM.optional(),
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

  try {
    const view = await listDependenciesForExperiment(experimentId, user.userId);
    return NextResponse.json(view);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: experimentId } = await params;

  // From-side ownership gate.
  const owned = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const dependency = await createDependency(experimentId, user.userId, {
      toExperimentId: parsed.data.toExperimentId,
      kind: parsed.data.kind as DependencyKind,
      notes: parsed.data.notes ?? null,
      metadata: parsed.data.metadata,
    });
    await recordAudit({
      actorId: user.userId,
      action: 'research.dependency.created',
      payload: {
        dependencyId: dependency.id,
        fromExperimentId: experimentId,
        toExperimentId: dependency.toExperimentId,
        kind: dependency.kind,
      },
      projectId: experimentId,
    });
    return NextResponse.json({ dependency }, { status: 201 });
  } catch (err) {
    if (err instanceof DependencySelfLoopError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof DependencyCrossOwnershipError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof DependencyDuplicateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create dependency' },
      { status: 400 },
    );
  }
}
