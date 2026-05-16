/**
 * Business OS Phase 5 — single P&L snapshot route.
 *
 * GET    /api/tiresias/agentic-os/business/pnl/snapshots/[id]
 * PATCH  /api/tiresias/agentic-os/business/pnl/snapshots/[id]
 * DELETE /api/tiresias/agentic-os/business/pnl/snapshots/[id]
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getSnapshot,
  updateSnapshot,
  deleteSnapshot,
} from '@/lib/agentic-os/business/pnl-snapshots-repo';

const PatchBody = z.object({
  is_locked: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const snapshot = await getSnapshot(id, user.userId);
  if (!snapshot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ snapshot });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getSnapshot(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const outcome = await updateSnapshot(id, user.userId, {
    isLocked: d.is_locked,
    notes: d.notes,
  });

  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.kind === 'locked') {
    return NextResponse.json({ error: outcome.reason }, { status: 400 });
  }

  // Use specific audit action for lock/unlock
  if (d.is_locked !== undefined) {
    await recordAudit({
      actorId: user.userId,
      action: d.is_locked ? 'business.pnl.snapshot.locked' : 'business.pnl.snapshot.unlocked',
      payload: { snapshotId: id },
    });
  } else {
    await recordAudit({
      actorId: user.userId,
      action: 'business.pnl.snapshot.updated',
      payload: { snapshotId: id, fields: Object.keys(d) },
    });
  }

  return NextResponse.json({ snapshot: outcome.snapshot });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const outcome = await deleteSnapshot(id, user.userId);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.kind === 'locked') {
    return NextResponse.json({ error: outcome.reason }, { status: 400 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.pnl.snapshot.deleted',
    payload: { snapshotId: id },
  });

  return NextResponse.json({ ok: true });
}
