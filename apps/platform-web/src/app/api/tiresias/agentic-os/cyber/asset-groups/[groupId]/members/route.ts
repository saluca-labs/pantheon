/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/asset-groups/[groupId]/members
 *
 * POST   — add an asset to the group     (body: { assetId }).
 * DELETE — remove an asset from the group (body: { assetId }).
 *
 * Both verbs verify the group + asset belong to the authenticated owner
 * before mutating the join table.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  addAssetToGroup,
  removeAssetFromGroup,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';

const MemberBody = z.object({ assetId: z.string().uuid() });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = MemberBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const ok = await addAssetToGroup({
    groupId,
    assetId: parsed.data.assetId,
    ownerId: user.userId,
  });
  if (!ok) return NextResponse.json({ error: 'Group or asset not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.asset_group.member_added',
    payload: { groupId, assetId: parsed.data.assetId },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = MemberBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const ok = await removeAssetFromGroup({
    groupId,
    assetId: parsed.data.assetId,
    ownerId: user.userId,
  });
  if (!ok) return NextResponse.json({ error: 'Membership not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.asset_group.member_removed',
    payload: { groupId, assetId: parsed.data.assetId },
  });
  return NextResponse.json({ ok: true });
}
