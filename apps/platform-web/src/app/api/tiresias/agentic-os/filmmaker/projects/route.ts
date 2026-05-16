/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects
 *
 * GET  — list all projects for the authenticated user.
 * POST — create a new project (full upsert body).
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { listProjects, createProject, recordAudit } from '@/lib/agentic-os/filmmaker/repo';
import {
  PROJECT_STATUSES,
  FORMATS,
  PHASE_KEYS,
  coercePhaseProgress,
  type ProjectStatus,
  type ProjectFormat,
} from '@/lib/agentic-os/filmmaker/projects';

const PhaseProgressSchema = z
  .object(
    Object.fromEntries(PHASE_KEYS.map((k) => [k, z.number().min(0).max(100).optional()])),
  )
  .partial();

const ProjectBody = z.object({
  name: z.string().min(1).max(200),
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

export async function GET() {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projects = await listProjects(user.userId);
  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentFilmmakerUser();
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
    format: d.format as ProjectFormat | undefined,
    logline: d.logline ?? null,
    coverImageUrl: d.coverImageUrl ?? null,
    phaseProgress: d.phaseProgress ? coercePhaseProgress(d.phaseProgress) : undefined,
    targetCompletionDate: d.targetCompletionDate ?? null,
    teamSize: d.teamSize ?? null,
    metadata: d.metadata,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.project.create',
    payload: { projectId: project.id },
    projectId: project.id,
  });

  return NextResponse.json({ project }, { status: 201 });
}
