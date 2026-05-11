/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/cases/[caseId]/alerts
 *
 * POST   — attach an alert (body: { alertId }).
 * DELETE — detach an alert (?alertId=…).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  attachAlertToCase,
  detachAlertFromCase,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';

const AttachBody = z.object({ alertId: z.string().uuid() });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = AttachBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const ok = await attachAlertToCase({
    caseId,
    alertId: parsed.data.alertId,
    ownerId: user.userId,
  });
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.case.alert_attached',
    payload: { caseId, alertId: parsed.data.alertId },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const alertId = request.nextUrl.searchParams.get('alertId');
  if (!alertId) {
    return NextResponse.json({ error: 'Missing alertId' }, { status: 400 });
  }

  const ok = await detachAlertFromCase({ caseId, alertId, ownerId: user.userId });
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.case.alert_detached',
    payload: { caseId, alertId },
  });
  return NextResponse.json({ ok: true });
}
