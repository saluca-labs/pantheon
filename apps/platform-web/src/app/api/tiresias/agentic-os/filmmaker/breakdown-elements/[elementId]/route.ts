/**
 * Filmmaker OS — /api/tiresias/agentic-os/filmmaker/breakdown-elements/[elementId]
 *
 * PATCH  — update an element.
 * DELETE — remove an element.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getBreakdownElement,
  updateBreakdownElement,
  deleteBreakdownElement,
  recordAudit,
} from '@/lib/agentic-os/filmmaker/repo';
import { BREAKDOWN_CATEGORY_VALUES } from '@/lib/agentic-os/filmmaker/breakdown';

const PatchBody = z
  .object({
    category: z.enum(BREAKDOWN_CATEGORY_VALUES).optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional().nullable(),
    quantity: z.number().int().min(1).max(10000).optional(),
    isPrincipal: z.boolean().optional(),
    characterId: z.string().uuid().optional().nullable(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

interface Props {
  params: Promise<{ elementId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { elementId } = await params;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const updated = await updateBreakdownElement({
      id: elementId,
      userId: user.userId,
      patch: parsed.data,
    });
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.breakdown_element.update',
      payload: { elementId, patch: parsed.data },
    });
    return NextResponse.json({ element: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { elementId } = await params;
  const existing = await getBreakdownElement(elementId, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const removed = await deleteBreakdownElement(elementId, user.userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.breakdown_element.delete',
    payload: { elementId, sceneId: existing.sceneId },
  });
  return NextResponse.json({ ok: true });
}
