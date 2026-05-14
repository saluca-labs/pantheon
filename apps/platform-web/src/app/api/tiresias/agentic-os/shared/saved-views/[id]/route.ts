/**
 * Shared SavedViews — single-view endpoint.
 *
 * DELETE /api/tiresias/agentic-os/shared/saved-views/:id
 *   Hard-delete a saved view owned by the current user. Saved views are
 *   a convenience layer, not a system of record — no soft delete.
 *   404 when the id does not belong to the caller (cross-ownership
 *   guard lives in the repo). Returns `{ ok: true }` on success.
 *
 * Auth: `@platform/auth` via the shared OS session helper. 401 when
 * unauthenticated.
 *
 * @license MIT — Tiresias platform / Wave E shared primitives (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentOsUser } from '@/lib/agentic-os/_shared/session';
import { recordAudit } from '@/lib/agentic-os/health/repo';
import { deleteSavedView } from '@/lib/agentic-os/_shared/saved-views-repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentOsUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const removed = await deleteSavedView(id, user.userId);
  if (!removed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'shared.saved-view.deleted',
    payload: { id },
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[saved-views] audit failed', err);
  });

  return NextResponse.json({ ok: true });
}
