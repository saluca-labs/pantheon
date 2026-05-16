/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]
 *
 * GET    — fetch one project.
 * PATCH  — partial update of project metadata.
 * DELETE — remove project (parts cascade via the FK on agos_maker_parts).
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  getProject,
  updateProject,
  deleteProject,
  recordAudit,
  type UpdateMakerProjectInput,
} from '@/lib/agentic-os/maker/repo';
import {
  PROJECT_STATUSES,
  MAKER_PHASES,
  coercePhaseProgress,
} from '@/lib/agentic-os/maker/projects';

const PhaseProgressSchema = z
  .object(
    Object.fromEntries(MAKER_PHASES.map((k) => [k, z.number().min(0).max(100).optional()])),
  )
  .partial();

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(PROJECT_STATUSES as unknown as [string, ...string[]]).optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
  coverImageUrl: z.string().url().max(2000).nullable().optional(),
  targetCompletionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  teamSize: z.number().int().min(0).max(10_000).nullable().optional(),
  phaseProgress: PhaseProgressSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const project = await getProject(id, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const project = await updateProject(id, user.userId, {
    ...(d as UpdateMakerProjectInput),
    phaseProgress: d.phaseProgress ? coercePhaseProgress(d.phaseProgress) : undefined,
  });
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'maker.project.updated',
    payload: { projectId: id, fields: Object.keys(d) },
    projectId: id,
  });

  return NextResponse.json({ project });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const removed = await deleteProject(id, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'maker.project.deleted',
    payload: { projectId: id },
    projectId: id,
  });

  return NextResponse.json({ ok: true });
}
