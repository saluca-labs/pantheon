/**
 * Autobiographer OS — /api/tiresias/agentic-os/autobiographer/memories/[id]/people
 *
 * GET  — list people linked to the memory (joined with their canonical
 *        name + consent state + role from the join row). Cross-ownership:
 *        404 if the memory does not belong to caller.
 * POST — link a person to the memory with optional `role` + `notes`.
 *        Audited. 404 if either endpoint is missing/foreign; 409 if the
 *        link already exists.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { getMemory } from '@/lib/agentic-os/autobiographer/memories-repo';
import {
  listPeopleForMemory,
  linkPersonToMemory,
} from '@/lib/agentic-os/autobiographer/memory-people-repo';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';

const LinkBody = z.object({
  personId: z.string().uuid(),
  role: z.string().max(100).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: memoryId } = await params;

  // Cross-ownership check first — 404 hides existence from non-owners.
  const memory = await getMemory(memoryId, user.userId);
  if (!memory) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const people = await listPeopleForMemory(memoryId, user.userId);
  return NextResponse.json({ people });
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

  const d = parsed.data;
  try {
    const link = await linkPersonToMemory(
      memoryId,
      d.personId,
      user.userId,
      { role: d.role ?? null, notes: d.notes ?? null },
    );

    // For the audit row, attempt to pull the parent memory's bookId so the
    // timeline groups under the right book. `getMemory` already filtered by
    // user_id when we did the ownership check inside `linkPersonToMemory`.
    const memory = await getMemory(memoryId, user.userId);

    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.memory_person.linked',
      payload: {
        memoryId,
        personId: d.personId,
        role: d.role ?? null,
      },
      projectId: memory?.bookId ?? null,
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (err?.code === 'duplicate') {
      return NextResponse.json(
        { error: 'Person is already linked to this memory.' },
        { status: 409 },
      );
    }
    throw err;
  }
}
