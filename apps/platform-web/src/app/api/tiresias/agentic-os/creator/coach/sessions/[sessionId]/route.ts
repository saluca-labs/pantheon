/**
 * Creator coach — single session get / patch / delete.
 *
 * GET    — fetch session + full transcript.
 * PATCH  — rename title or change mode.
 * DELETE — drop the session row.
 *
 * Every operation enforces session ownership via `user_id` on the SQL
 * read; an attempted access to a peer user's session returns 404.
 *
 * @license MIT — Tiresias Creator OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import {
  deleteSession,
  getSession,
  updateSession,
} from '@/lib/agentic-os/creator/coach/sessions-repo';
import { COACH_MODE_VALUES, type CoachMode } from '@/lib/agentic-os/creator/coach/modes';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ sessionId: string }>;
}

const Patch = z.object({
  title: z.string().min(1).max(120).optional(),
  mode: z.enum(COACH_MODE_VALUES as unknown as [string, ...string[]]).optional(),
});

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const session = await getSession(sessionId, user.userId);
  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ session });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const updated = await updateSession(sessionId, user.userId, {
    title: parsed.data.title,
    mode: parsed.data.mode as CoachMode | undefined,
  });
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ session: updated });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const existing = await getSession(sessionId, user.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const ok = await deleteSession(sessionId, user.userId);
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
