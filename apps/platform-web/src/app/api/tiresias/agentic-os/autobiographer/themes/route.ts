/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/themes
 *
 * GET  — list / search themes for the caller.
 * POST — create a new theme. 409 on duplicate slug or case-insensitive
 *        name within the user.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import {
  createTheme,
  listThemes,
} from '@/lib/agentic-os/autobiographer/themes-repo';
import {
  THEME_COLOR_MAX,
  THEME_DESCRIPTION_MAX,
  THEME_NAME_MAX,
  THEME_SLUG_MAX,
} from '@/lib/agentic-os/autobiographer/themes';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const PostBody = z
  .object({
    name: z.string().min(1).max(THEME_NAME_MAX),
    slug: z
      .string()
      .min(1)
      .max(THEME_SLUG_MAX)
      .regex(/^[a-z0-9-]+$/, 'slug must be kebab-case alphanumeric')
      .nullable()
      .optional(),
    description: z.string().max(THEME_DESCRIPTION_MAX).nullable().optional(),
    color: z.string().max(THEME_COLOR_MAX).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const search = request.nextUrl.searchParams.get('q') ?? undefined;
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? 100);
  const offset = Number(request.nextUrl.searchParams.get('offset') ?? 0);
  const themes = await listThemes({
    userId: user.userId,
    search,
    limit: Number.isFinite(limit) ? limit : 100,
    offset: Number.isFinite(offset) ? offset : 0,
  });
  return NextResponse.json({ themes });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = PostBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  try {
    const theme = await createTheme(user.userId, {
      name: d.name,
      slug: d.slug ?? null,
      description: d.description ?? null,
      color: d.color ?? null,
      metadata: d.metadata,
    });
    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.theme.created',
      payload: { themeId: theme.id, slug: theme.slug },
      projectId: null,
    });
    return NextResponse.json({ theme }, { status: 201 });
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
