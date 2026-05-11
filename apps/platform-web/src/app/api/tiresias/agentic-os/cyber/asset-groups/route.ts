/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/asset-groups
 *
 * GET  — list groups for the authenticated user (with member counts).
 * POST — create a new group.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listAssetGroups, createAssetGroup, recordAudit } from '@/lib/agentic-os/cyber/repo';

const GroupBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(32).optional(),
});

export async function GET() {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const groups = await listAssetGroups({ ownerId: user.userId });
  return NextResponse.json({ groups });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = GroupBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const group = await createAssetGroup(user.userId, parsed.data);
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.asset_group.created',
    payload: { id: group.id, name: group.name },
  });
  return NextResponse.json({ group }, { status: 201 });
}
