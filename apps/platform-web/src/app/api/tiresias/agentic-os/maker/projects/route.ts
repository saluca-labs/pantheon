/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects
 *
 * GET  — list all projects for the authenticated user.
 * POST — create a new project (full upsert body).
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { listProjects, createProject, recordAudit } from '@/lib/agentic-os/maker/repo';
import {
  PROJECT_STATUSES,
  MAKER_PHASES,
  coercePhaseProgress,
  type ProjectStatus,
} from '@/lib/agentic-os/maker/projects';

const PhaseProgressSchema = z
  .object(
    Object.fromEntries(MAKER_PHASES.map((k) => [k, z.number().min(0).max(100).optional()])),
  )
  .partial();

const ProjectBody = z.object({
  name: z.string().min(1).max(200),
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

export async function GET() {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projects = await listProjects(user.userId);
  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = ProjectBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const project = await createProject(user.userId, {
    name: d.name,
    description: d.description ?? null,
    status: d.status as ProjectStatus | undefined,
    tags: d.tags,
    coverImageUrl: d.coverImageUrl ?? null,
    targetCompletionDate: d.targetCompletionDate ?? null,
    teamSize: d.teamSize ?? null,
    phaseProgress: d.phaseProgress ? coercePhaseProgress(d.phaseProgress) : undefined,
    metadata: d.metadata,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'maker.project.created',
    payload: { projectId: project.id },
    projectId: project.id,
  });

  return NextResponse.json({ project }, { status: 201 });
}
