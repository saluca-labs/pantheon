/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/dependencies/[depId]
 *
 * PATCH  — update status / notes / kind on an existing edge.
 * DELETE — unlink (hard delete the edge).
 *
 * Auth + audit on every handler.
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  updateProjectDependency,
  deleteProjectDependency,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import {
  DEPENDENCY_KIND_VALUES,
  DEPENDENCY_STATUS_VALUES,
  type ProjectDependencyPatch,
} from '@/lib/agentic-os/maker/dependencies';

const KIND_ENUM = z.enum(
  DEPENDENCY_KIND_VALUES as unknown as [string, ...string[]],
);
const STATUS_ENUM = z.enum(
  DEPENDENCY_STATUS_VALUES as unknown as [string, ...string[]],
);

const PatchBody = z.object({
  kind: KIND_ENUM.optional(),
  status: STATUS_ENUM.optional(),
  notes: z.string().max(8000).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string; depId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, depId } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const dependency = await updateProjectDependency(
      depId,
      projectId,
      user.userId,
      parsed.data as ProjectDependencyPatch,
    );
    if (!dependency) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await recordAudit({
      actorId: user.userId,
      action: 'maker.dependency.updated',
      payload: {
        dependencyId: dependency.id,
        fromProjectId: dependency.fromProjectId,
        toProjectId: dependency.toProjectId,
        fields: Object.keys(parsed.data),
      },
      projectId: dependency.fromProjectId,
    });
    return NextResponse.json({ dependency });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId, depId } = await params;
  try {
    const removed = await deleteProjectDependency(depId, projectId, user.userId);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.dependency.deleted',
      payload: { dependencyId: depId, fromProjectId: projectId },
      projectId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 400 },
    );
  }
}
