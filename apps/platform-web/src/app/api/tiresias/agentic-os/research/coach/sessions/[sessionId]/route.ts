/**
 * Research coach — single session get / patch / delete.
 *
 * GET    — fetch session + full transcript.
 * PATCH  — rename title (mode is IMMUTABLE post-create; a stray `mode`
 *          field in the body is rejected at the zod-schema layer by
 *          declaring `.strict()`).
 * DELETE — hard delete.
 *
 * Every operation enforces session ownership via `user_id` on the SQL
 * read; an attempted access to a peer user's session returns 404.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  deleteSession,
  getSession,
  updateSession,
} from '@/lib/agentic-os/research/coach/sessions-repo';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ sessionId: string }>;
}

// `.strict()` makes a stray `mode` field in the patch body fail validation
// — mode is immutable post-create.
const Patch = z
  .object({
    title: z.string().min(1).max(120),
  })
  .strict();

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const session = await getSession(sessionId, user.userId);
  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ session });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
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
    action: 'research.coach.session_renamed',
    payload: { session_id: sessionId, fields: ['title'] },
    projectId: updated.experimentId,
  });
  return NextResponse.json({ session: updated });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
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
    action: 'research.coach.session_deleted',
    payload: { session_id: sessionId },
    projectId: existing.experimentId,
  });
  return NextResponse.json({ ok: true });
}
