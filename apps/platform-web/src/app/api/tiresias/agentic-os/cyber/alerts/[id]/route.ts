/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/alerts/[id]
 *
 * PATCH — update alert status, assignee, or notes.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { updateAlert, recordAudit } from '@/lib/agentic-os/cyber/repo';

const PatchBody = z.object({
  status: z.enum(['open', 'investigating', 'resolved', 'false_positive']).optional(),
  assignedTo: z.string().max(320).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

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

  const alert = await updateAlert(id, user.userId, parsed.data);
  if (!alert) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.alert.updated',
    payload: { id, fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ alert });
}
