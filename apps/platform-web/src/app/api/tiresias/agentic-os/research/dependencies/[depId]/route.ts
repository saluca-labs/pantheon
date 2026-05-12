/**
 * Research OS Phase 6 — /api/tiresias/agentic-os/research/dependencies/[depId]
 *
 * PATCH  — update kind / status / notes. Transitioning status from
 *          'open' → 'cleared' emits 'research.dependency.cleared' audit;
 *          'cleared' → 'open' emits 'research.dependency.reopened'.
 * DELETE — hard-delete the edge.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  getDependency,
  updateDependency,
  deleteDependency,
} from '@/lib/agentic-os/research/dependencies-repo';
import {
  DEPENDENCY_KIND_VALUES,
  DEPENDENCY_STATUS_VALUES,
} from '@/lib/agentic-os/research/dependencies';

const KIND_ENUM = z.enum(
  DEPENDENCY_KIND_VALUES as unknown as [string, ...string[]],
);
const STATUS_ENUM = z.enum(
  DEPENDENCY_STATUS_VALUES as unknown as [string, ...string[]],
);

const PatchBody = z.object({
  kind: KIND_ENUM.optional(),
  status: STATUS_ENUM.optional(),
  notes: z.string().max(4000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ depId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { depId } = await params;

  const existing = await getDependency(depId, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const dependency = await updateDependency(depId, user.userId, parsed.data as any);
    if (!dependency) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Status transition audit events.
    if (parsed.data.status && parsed.data.status !== existing.status) {
      if (parsed.data.status === 'cleared') {
        await recordAudit({
          actorId: user.userId,
          action: 'research.dependency.cleared',
          payload: {
            dependencyId: depId,
            fromExperimentId: existing.fromExperimentId,
            toExperimentId: existing.toExperimentId,
          },
          projectId: existing.fromExperimentId,
        });
      } else if (parsed.data.status === 'open') {
        await recordAudit({
          actorId: user.userId,
          action: 'research.dependency.reopened',
          payload: {
            dependencyId: depId,
            fromExperimentId: existing.fromExperimentId,
            toExperimentId: existing.toExperimentId,
          },
          projectId: existing.fromExperimentId,
        });
      }
    }

    return NextResponse.json({ dependency });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update dependency' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { depId } = await params;

  const existing = await getDependency(depId, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await deleteDependency(depId, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'research.dependency.deleted',
    payload: {
      dependencyId: depId,
      fromExperimentId: existing.fromExperimentId,
      toExperimentId: existing.toExperimentId,
    },
    projectId: existing.fromExperimentId,
  });

  return NextResponse.json({ ok: true });
}
