/**
 * Business OS Phase 1 — person restore route.
 *
 * POST /api/tiresias/agentic-os/business/people/[id]/restore
 *   Clear archived_at.  404 when the person doesn't exist for this user;
 *   400 when the person is already active.  Audits
 *   `business.person.restored`.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { restorePerson } from '@/lib/agentic-os/business/people-repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const outcome = await restorePerson(id, user.userId);
  if (outcome == null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (outcome.alreadyActive) {
    return NextResponse.json({ error: 'Person is already active' }, { status: 400 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'business.person.restored',
    payload: { personId: id },
  });
  return NextResponse.json({ person: outcome.person });
}
