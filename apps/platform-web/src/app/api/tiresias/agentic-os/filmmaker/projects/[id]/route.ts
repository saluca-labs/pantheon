/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects/[id]
 *
 * GET    — fetch one project enriched with shot-list stats.
 * PATCH  — partial update of project metadata.
 * DELETE — remove project (shots cascade via FK).
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getProjectWithStats,
  updateProject,
  deleteProject,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import {
  PROJECT_STATUSES,
  FORMATS,
  PHASE_KEYS,
  coercePhaseProgress,
  type ProjectUpsert,
} from '@/lib/agentic-os/filmmaker/projects';

const PhaseProgressSchema = z
  .object(
    Object.fromEntries(PHASE_KEYS.map((k) => [k, z.number().min(0).max(100).optional()])),
  )
  .partial();

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(PROJECT_STATUSES as unknown as [string, ...string[]]).optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
  format: z.enum(FORMATS as unknown as [string, ...string[]]).optional(),
  logline: z.string().max(500).nullable().optional(),
  coverImageUrl: z.string().url().max(2000).nullable().optional(),
  phaseProgress: PhaseProgressSchema.optional(),
  targetCompletionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  teamSize: z.number().int().min(0).max(10_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const project = await getProjectWithStats(id, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
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
    ...(d as Partial<ProjectUpsert>),
    phaseProgress: d.phaseProgress ? coercePhaseProgress(d.phaseProgress) : undefined,
  });
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.project.update',
    payload: { projectId: id, fields: Object.keys(d) },
    projectId: id,
  });

  return NextResponse.json({ project });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const removed = await deleteProject(id, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.project.delete',
    payload: { projectId: id },
    projectId: id,
  });

  return NextResponse.json({ ok: true });
}
