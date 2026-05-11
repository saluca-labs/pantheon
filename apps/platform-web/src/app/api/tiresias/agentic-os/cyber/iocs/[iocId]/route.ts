/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/iocs/[iocId]
 *
 * GET / PATCH / DELETE a single IOC.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  deleteIoc,
  getIoc,
  recordAudit,
  updateIoc,
} from '@/lib/agentic-os/cyber/repo';
import { THREAT_TYPE_VALUES } from '@/lib/agentic-os/cyber/iocs';

const IocPatchBody = z.object({
  title: z.string().max(200).nullable().optional(),
  description: z.string().max(8000).nullable().optional(),
  threatType: z.enum(THREAT_TYPE_VALUES).nullable().optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  firstSeenAt: z.string().datetime().optional(),
  lastSeenAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  source: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(32).optional(),
  references: z.array(z.string().url().max(500)).max(32).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ iocId: string }> },
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { iocId } = await ctx.params;
  const ioc = await getIoc(iocId, user.userId);
  if (!ioc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ioc });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ iocId: string }> },
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { iocId } = await ctx.params;
  const parsed = IocPatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const ioc = await updateIoc(iocId, user.userId, parsed.data);
  if (!ioc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.ioc.update',
    payload: { id: iocId, patch: Object.keys(parsed.data) },
  });
  return NextResponse.json({ ioc });
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ iocId: string }> },
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { iocId } = await ctx.params;
  const ok = await deleteIoc(iocId, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.ioc.delete',
    payload: { id: iocId },
  });
  return NextResponse.json({ ok: true });
}
