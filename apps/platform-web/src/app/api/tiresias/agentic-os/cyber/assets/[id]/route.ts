/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/assets/[id]
 *
 * GET    — fetch asset by id.
 * PATCH  — update asset fields.
 * DELETE — hard delete (cascades group memberships and detaches alerts).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  getAsset,
  updateAsset,
  deleteAsset,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';
import { ASSET_KIND_VALUES, ASSET_CRITICALITY_VALUES } from '@/lib/agentic-os/cyber/assets';

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: z.enum(ASSET_KIND_VALUES).optional(),
  criticality: z.enum(ASSET_CRITICALITY_VALUES).optional(),
  environment: z.string().max(60).nullable().optional(),
  hostname: z.string().max(253).nullable().optional(),
  ipAddress: z.string().ip().nullable().optional(),
  osFamily: z.string().max(60).nullable().optional(),
  osVersion: z.string().max(60).nullable().optional(),
  ownerEmail: z.string().email().max(320).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(32).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const asset = await getAsset(id, user.userId);
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ asset });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const asset = await updateAsset(id, user.userId, parsed.data);
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.asset.updated',
    payload: { id, fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ asset });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ok = await deleteAsset(id, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.asset.deleted',
    payload: { id },
  });
  return NextResponse.json({ ok: true });
}
