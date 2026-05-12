/**
 * Business OS Phase 3 — stop timer convenience route.
 *
 * POST /api/tiresias/agentic-os/business/time-entries/[id]/stop
 *   Stop a running timer.  Maps outcomes:
 *     - not_found      → 404
 *     - already_stopped → 400 "Timer is already stopped"
 *     - ok             → 200 with entry
 *   Audits `business.time_entry.stopped`.
 *
 * @license MIT — Tiresias Business OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { stopTimer } from '@/lib/agentic-os/business/time-entries-repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const outcome = await stopTimer(id, user.userId);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.kind === 'already_stopped') {
    return NextResponse.json({ error: 'Timer is already stopped' }, { status: 400 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.time_entry.stopped',
    payload: { entryId: id, durationMinutes: outcome.entry.durationMinutes },
  });
  return NextResponse.json({ entry: outcome.entry });
}
