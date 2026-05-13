/**
 * Business coach — single session get / patch / delete.
 *
 * GET    — fetch session + full transcript.
 * PATCH  — rename title.
 * DELETE — drop the session row.
 *
 * Every operation enforces session ownership via `user_id` on the SQL
 * read; an attempted access to a peer user's session returns 404.
 *
 * @license MIT — Tiresias Business OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  deleteSession,
  getSession,
  updateSession,
} from '@/lib/agentic-os/business/coach/sessions-repo';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ sessionId: string }>;
}

const Patch = z.object({
  title: z.string().min(1).max(120),
});

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const session = await getSession(sessionId, user.userId);
  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ session });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
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
  });
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'business.coach.session_renamed',
    payload: { session_id: sessionId, fields: ['title'] },
    projectId: updated.projectId,
  });
  return NextResponse.json({ session: updated });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
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
  await recordAudit({
    actorId: user.userId,
    action: 'business.coach.session_deleted',
    payload: { session_id: sessionId },
    projectId: existing.projectId,
  });
  return NextResponse.json({ ok: true });
}
