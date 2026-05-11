/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/scenes/[sceneId]/breakdown-elements
 *
 * GET  — list all breakdown elements on the scene.
 * POST — add a new element.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  listBreakdownElements,
  addBreakdownElement,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import { BREAKDOWN_CATEGORY_VALUES } from '@/lib/agentic-os/filmmaker/breakdown';

const CreateBody = z.object({
  category: z.enum(BREAKDOWN_CATEGORY_VALUES),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  quantity: z.number().int().min(1).max(10000).optional(),
  isPrincipal: z.boolean().optional(),
  characterId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

interface Props {
  params: Promise<{ sceneId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sceneId } = await params;
  const elements = await listBreakdownElements({ sceneId, userId: user.userId });
  return NextResponse.json({ elements });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sceneId } = await params;
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const element = await addBreakdownElement({
      sceneId,
      userId: user.userId,
      data: parsed.data,
    });
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.breakdown_element.create',
      payload: {
        elementId: element.id,
        sceneId,
        category: element.category,
        name: element.name,
      },
    });
    return NextResponse.json({ element }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add element' },
      { status: 400 },
    );
  }
}
