/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/cases/[caseId]/events
 *
 * GET  — list case events (most recent first).
 * POST — append a note (body: { body, author? }).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  listCaseEvents,
  appendCaseEvent,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';

const NoteBody = z.object({
  body: z.string().min(1).max(8000),
  author: z.string().max(120).nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const events = await listCaseEvents(caseId, user.userId);
  return NextResponse.json({ events });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = NoteBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const event = await appendCaseEvent({
    caseId,
    ownerId: user.userId,
    kind: 'note',
    author: parsed.data.author ?? user.email,
    body: parsed.data.body,
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.case.event.append',
    payload: { caseId, eventId: event.id, kind: 'note' },
  });
  return NextResponse.json({ event }, { status: 201 });
}
