/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/exposures/[exposureId]
 *
 * GET / PATCH / DELETE a single exposure.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  deleteExposure,
  getExposure,
  recordAudit,
  updateExposure,
} from '@/lib/agentic-os/cyber/repo';
import {
  EXPOSURE_PRIORITY_VALUES,
  EXPOSURE_STATUS_VALUES,
} from '@/lib/agentic-os/cyber/exposures';

const ExposurePatchBody = z.object({
  status: z.enum(EXPOSURE_STATUS_VALUES).optional(),
  detectedBy: z.string().max(120).nullable().optional(),
  assignedTo: z.string().max(120).nullable().optional(),
  priority: z.enum(EXPOSURE_PRIORITY_VALUES).optional(),
  notes: z.string().max(16000).nullable().optional(),
  evidenceUrl: z.string().url().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ exposureId: string }> },
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { exposureId } = await ctx.params;
  const e = await getExposure(exposureId, user.userId);
  if (!e) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ exposure: e });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ exposureId: string }> },
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { exposureId } = await ctx.params;
  const parsed = ExposurePatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const e = await updateExposure(exposureId, user.userId, parsed.data);
  if (!e) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.exposure.update',
    payload: { id: exposureId, patch: Object.keys(parsed.data) },
  });
  return NextResponse.json({ exposure: e });
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ exposureId: string }> },
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { exposureId } = await ctx.params;
  const ok = await deleteExposure(exposureId, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.exposure.delete',
    payload: { id: exposureId },
  });
  return NextResponse.json({ ok: true });
}
