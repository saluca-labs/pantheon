/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/projects/[id]/screenplay
 *
 * GET   — fetch (or auto-create) the project's screenplay + head version + scenes.
 * PATCH — update title / format / status / metadata.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getProject,
  getOrCreateScreenplayForProject,
  getScreenplayVersion,
  listScreenplayScenes,
  updateScreenplayMeta,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import {
  SCREENPLAY_FORMAT_VALUES,
  SCREENPLAY_STATUS_VALUES,
  type ScreenplayUpsert,
} from '@/lib/agentic-os/filmmaker/screenplays';

const PatchBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
    format: z
      .enum(SCREENPLAY_FORMAT_VALUES as unknown as [string, ...string[]])
      .optional(),
    status: z
      .enum(SCREENPLAY_STATUS_VALUES as unknown as [string, ...string[]])
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (d) => Object.values(d).some((v) => v !== undefined),
    { message: 'Provide at least one of: title, format, status, metadata.' },
  );

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const project = await getProject(id, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const screenplay = await getOrCreateScreenplayForProject(id, user.userId);
  const headVersion = screenplay.headVersionId
    ? await getScreenplayVersion(screenplay.headVersionId, user.userId)
    : null;
  const scenes = headVersion
    ? await listScreenplayScenes(headVersion.id, user.userId)
    : [];

  return NextResponse.json({ screenplay, headVersion, scenes });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const project = await getProject(id, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const screenplay = await getOrCreateScreenplayForProject(id, user.userId);

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let updated;
  try {
    updated = await updateScreenplayMeta({
      id: screenplay.id,
      userId: user.userId,
      patch: parsed.data as ScreenplayUpsert,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 400 },
    );
  }
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.screenplay.update_meta',
    payload: { screenplayId: screenplay.id, fields: Object.keys(parsed.data) },
    projectId: id,
  });

  return NextResponse.json({ screenplay: updated });
}
