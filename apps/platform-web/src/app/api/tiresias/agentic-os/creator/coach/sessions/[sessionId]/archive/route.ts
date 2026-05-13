/**
 * Creator coach — toggle session archive status.
 *
 * POST — toggle the `archived_at` column on a session. If archived,
 *        unarchives. If active, archives.
 *
 * Soft-delete semantics: archived sessions are excluded from the default
 * list query and the active-session sidebar, but they remain queryable
 * with `?includeArchived=true`.
 *
 * @license MIT — Tiresias Creator OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { toggleArchive } from '@/lib/agentic-os/creator/coach/sessions-repo';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ sessionId: string }>;
}

export async function POST(_request: NextRequest, { params }: Props) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const session = await toggleArchive(sessionId, user.userId);
  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ session });
}
