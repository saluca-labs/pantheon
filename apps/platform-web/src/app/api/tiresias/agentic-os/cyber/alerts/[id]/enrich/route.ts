/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/alerts/[id]/enrich
 *
 * PATCH — link an alert to an asset + log source, tag it, and set MITRE
 *         tactic/technique. Pass `null` for assetId/logSourceId to clear
 *         the FK without deleting the alert; omit a field to leave it
 *         untouched.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  updateAlertEnrichment,
  getAsset,
  getLogSource,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';

const EnrichBody = z.object({
  assetId: z.string().uuid().nullable().optional(),
  logSourceId: z.string().uuid().nullable().optional(),
  tactic: z.string().max(60).nullable().optional(),
  technique: z.string().max(60).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(32).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = EnrichBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  // Verify any provided FKs belong to this owner (DB only enforces existence,
  // not ownership). null is allowed — that clears the link.
  if (parsed.data.assetId) {
    const asset = await getAsset(parsed.data.assetId, user.userId);
    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }
  if (parsed.data.logSourceId) {
    const source = await getLogSource(parsed.data.logSourceId, user.userId);
    if (!source) return NextResponse.json({ error: 'Log source not found' }, { status: 404 });
  }

  const alert = await updateAlertEnrichment({
    alertId: id,
    ownerId: user.userId,
    patch: parsed.data,
  });
  if (!alert) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.alert.enrich',
    payload: { id, fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ alert });
}
