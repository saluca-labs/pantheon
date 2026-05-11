/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/asset-groups/[groupId]
 *
 * GET    — fetch group detail (includes members).
 * PATCH  — update group fields.
 * DELETE — cascade-delete group + memberships.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  getAssetGroup,
  updateAssetGroup,
  deleteAssetGroup,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(32).optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const group = await getAssetGroup(groupId, user.userId);
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ group });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const group = await updateAssetGroup(groupId, user.userId, parsed.data);
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.asset_group.updated',
    payload: { id: groupId, fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ group });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ok = await deleteAssetGroup(groupId, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.asset_group.deleted',
    payload: { id: groupId },
  });
  return NextResponse.json({ ok: true });
}
