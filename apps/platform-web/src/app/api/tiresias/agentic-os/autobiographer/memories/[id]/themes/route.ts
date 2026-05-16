/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/memories/[id]/themes
 *
 * GET  — list themes attached to the memory.
 * POST — link a theme. 404 if either endpoint is missing/foreign; 409
 *        on duplicate link.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getMemory } from '@/lib/agentic-os/autobiographer/memories-repo';
import {
  linkThemeToMemory,
  listThemesForMemory,
} from '@/lib/agentic-os/autobiographer/memory-themes-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const LinkBody = z
  .object({
    themeId: z.string().uuid(),
  })
  .strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: memoryId } = await params;
  const memory = await getMemory(memoryId, user.userId);
  if (!memory) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const themes = await listThemesForMemory(memoryId, user.userId);
  return NextResponse.json({ themes });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: memoryId } = await params;
  const parsed = LinkBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const link = await linkThemeToMemory(memoryId, parsed.data.themeId, user.userId);
    const memory = await getMemory(memoryId, user.userId);
    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.memory_theme.linked',
      payload: { memoryId, themeId: parsed.data.themeId },
      projectId: memory?.bookId ?? null,
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (errErr?.code === 'duplicate') {
      return NextResponse.json(
        { error: 'Theme is already linked to this memory.' },
        { status: 409 },
      );
    }
    throw err;
  }
}
