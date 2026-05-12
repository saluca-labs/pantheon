/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/themes/[id]
 *
 * GET    — fetch one theme by id.
 * PATCH  — update name/slug/description/color/metadata. Zod .strict()
 *          rejects unknown fields (Phase 6 will relax this to admit
 *          `sensitivity`).
 * DELETE — hard delete; CASCADE removes memory_themes + chapter_themes
 *          via the FK.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  deleteTheme,
  getTheme,
  updateTheme,
} from '@/lib/agentic-os/autobiographer/themes-repo';
import {
  THEME_COLOR_MAX,
  THEME_DESCRIPTION_MAX,
  THEME_NAME_MAX,
  THEME_SLUG_MAX,
} from '@/lib/agentic-os/autobiographer/themes';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const PatchBody = z
  .object({
    name: z.string().min(1).max(THEME_NAME_MAX).optional(),
    slug: z
      .string()
      .min(1)
      .max(THEME_SLUG_MAX)
      .regex(/^[a-z0-9-]+$/, 'slug must be kebab-case alphanumeric')
      .optional(),
    description: z.string().max(THEME_DESCRIPTION_MAX).nullable().optional(),
    color: z.string().max(THEME_COLOR_MAX).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const theme = await getTheme(id, user.userId);
  if (!theme) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ theme });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const updated = await updateTheme(id, user.userId, parsed.data);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.theme.updated',
      payload: { themeId: id, fields: Object.keys(parsed.data) },
      projectId: null,
    });
    return NextResponse.json({ theme: updated });
  } catch (err: any) {
    if (err?.code === 'duplicate') {
      return NextResponse.json(
        { error: 'A theme with that slug or name already exists.' },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const removed = await deleteTheme(id, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.theme.deleted',
    payload: { themeId: id },
    projectId: null,
  });
  return NextResponse.json({ ok: true });
}
