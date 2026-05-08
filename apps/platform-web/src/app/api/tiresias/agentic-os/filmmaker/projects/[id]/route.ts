/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects/[id]
 *
 * PATCH — update an existing project by id (must belong to the authenticated user).
 *         Body: { name?: string, description?: string, status?: ProjectStatus, tags?: string[] }
 *         Response: { project: FilmmakerProject }
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { updateProject, recordAudit } from '@/lib/agentic-os/filmmaker/repo';
import { PROJECT_STATUSES } from '@/lib/agentic-os/filmmaker/projects';

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(PROJECT_STATUSES as unknown as [string, ...string[]]).optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
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

  const project = await updateProject(id, user.userId, parsed.data as any);
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.project.updated',
    payload: { projectId: id },
    projectId: id,
  });

  return NextResponse.json({ project });
}
