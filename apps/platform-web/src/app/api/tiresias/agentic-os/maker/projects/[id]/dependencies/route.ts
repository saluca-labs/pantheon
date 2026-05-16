/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/dependencies
 *
 * GET  — list directed edges in both directions for the project. Returns
 *        ``{ upstream, downstream }`` where each entry is hydrated with
 *        the peer project's ``{ id, name, status, phase }``. Edges
 *        pointing at projects the caller does NOT own are dropped — the
 *        repo joins against ``agos_maker_projects`` with the caller's
 *        user_id on both sides.
 * POST — create a directed edge from this project to another. Body
 *        ``{ to_project_id, kind?, notes? }``. Returns 400 on self-loop,
 *        404 if the peer is not owned by the user, 409 on duplicate.
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
  listProjectDependencies,
  createProjectDependency,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';
import { DEPENDENCY_KIND_VALUES, type DependencyKind } from '@/lib/agentic-os/maker/dependencies';

const KIND_ENUM = z.enum(
  DEPENDENCY_KIND_VALUES as unknown as [string, ...string[]],
);

const CreateBody = z.object({
  to_project_id: z.string().uuid(),
  kind: KIND_ENUM.optional(),
  notes: z.string().max(8000).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  try {
    const view = await listProjectDependencies(projectId, user.userId);
    return NextResponse.json(view);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not found' },
      { status: 404 },
    );
  }
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Self-loop short-circuit — the repo throws here too, but we return
  // 400 from the route directly so the error message lines up with the
  // spec verbatim.
  if (projectId === parsed.data.to_project_id) {
    return NextResponse.json(
      { error: 'A project cannot depend on itself.' },
      { status: 400 },
    );
  }

  try {
    const dependency = await createProjectDependency(projectId, user.userId, {
      toProjectId: parsed.data.to_project_id,
      kind: parsed.data.kind as DependencyKind | undefined,
      notes: parsed.data.notes,
    });
    await recordAudit({
      actorId: user.userId,
      action: 'maker.dependency.created',
      payload: {
        dependencyId: dependency.id,
        fromProjectId: dependency.fromProjectId,
        toProjectId: dependency.toProjectId,
        kind: dependency.kind,
      },
      projectId: dependency.fromProjectId,
    });
    return NextResponse.json({ dependency }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create dependency';
    const lower = msg.toLowerCase();
    if (
      lower.includes('duplicate key') ||
      lower.includes('unique constraint') ||
      lower.includes('agos_maker_project_dependencies_edge_unique')
    ) {
      return NextResponse.json(
        { error: 'Dependency edge already exists' },
        { status: 409 },
      );
    }
    if (lower.includes('peer project not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (lower.includes('cannot depend on itself')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (lower.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
