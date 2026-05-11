/**
 * CyberSec OS - /api/tiresias/agentic-os/cyber/detections/[ruleId]/runs
 *
 * GET  - list detection runs for the rule.
 * POST - record a manual detection run.
 *
 * @license MIT - Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  listDetectionRuns,
  recordDetectionRun,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';

const RecordRunBody = z.object({
  alertId: z.string().uuid().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  triggeredAt: z.string().datetime().optional(),
});

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ ruleId: string }> }
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { ruleId } = await ctx.params;

  const sp = _request.nextUrl.searchParams;
  const limitParam = sp.get('limit');
  let limit = 100;
  if (limitParam !== null) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 500) {
      limit = parsed;
    }
  }

  const runs = await listDetectionRuns({
    ownerId: user.userId,
    ruleId,
    limit,
  });
  return NextResponse.json({ runs });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ ruleId: string }> }
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { ruleId } = await ctx.params;

  const parsed = RecordRunBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const run = await recordDetectionRun({
    ownerId: user.userId,
    ruleId,
    alertId: parsed.data.alertId,
    payload: parsed.data.payload,
    triggeredAt: parsed.data.triggeredAt,
  });
  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.detection_run.record',
    payload: { id: run.id, ruleId },
  });
  return NextResponse.json({ run }, { status: 201 });
}
