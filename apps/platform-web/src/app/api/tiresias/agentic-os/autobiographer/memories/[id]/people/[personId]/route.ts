/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/memories/[id]/people/[personId]
 *
 * PATCH  — update `role` and/or `notes` on an existing link.
 * DELETE — remove the link. Person + memory rows survive.
 *
 * Both routes return 404 if either endpoint is missing or belongs to
 * another user (existence is not leaked to non-owners).
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getMemory } from '@/lib/agentic-os/autobiographer/memories-repo';
import {
  updateLink,
  deleteLink,
} from '@/lib/agentic-os/autobiographer/memory-people-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const PatchBody = z.object({
  role: z.string().max(100).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string; personId: string }>;
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: memoryId, personId } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const link = await updateLink(memoryId, personId, user.userId, parsed.data);
    if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const memory = await getMemory(memoryId, user.userId);

    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.memory_person.updated',
      payload: {
        memoryId,
        personId,
        fields: Object.keys(parsed.data),
      },
      projectId: memory?.bookId ?? null,
    });

    return NextResponse.json({ link });
  } catch (err: any) {
    if (err?.code === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: memoryId, personId } = await params;

  try {
    const removed = await deleteLink(memoryId, personId, user.userId);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const memory = await getMemory(memoryId, user.userId);

    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.memory_person.unlinked',
      payload: { memoryId, personId },
      projectId: memory?.bookId ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw err;
  }
}
