/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects
 *
 * GET  — list all projects for the authenticated user.
 *        Response: { projects: FilmmakerProject[] }
 *
 * POST — create a new project.
 *        Body: { name: string, description?: string, status?: ProjectStatus, tags?: string[] }
 *        Response: { project: FilmmakerProject }  HTTP 201
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { listProjects, createProject, recordAudit } from '@/lib/agentic-os/filmmaker/repo';
import { PROJECT_STATUSES } from '@/lib/agentic-os/filmmaker/projects';

const ProjectBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(PROJECT_STATUSES as unknown as [string, ...string[]]).optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
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

  const project = await createProject(user.userId, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    status: parsed.data.status as any,
    tags: parsed.data.tags,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.project.created',
    payload: { projectId: project.id },
    projectId: project.id,
  });

  return NextResponse.json({ project }, { status: 201 });
}
