/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/exposures/[exposureId]/close
 *
 * POST — transition an exposure into a closed state and stamp remediated_at.
 * body: { status: 'mitigated'|'resolved'|'false_positive', notes?: string }
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { closeExposure, recordAudit } from '@/lib/agentic-os/cyber/repo';

const CloseBody = z.object({
  status: z.enum(['mitigated', 'resolved', 'false_positive']),
  notes: z.string().max(16000).nullable().optional(),
});

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ exposureId: string }> },
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { exposureId } = await ctx.params;
  const parsed = CloseBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const e = await closeExposure({
    id: exposureId,
    ownerId: user.userId,
    status: parsed.data.status,
    notes: parsed.data.notes ?? null,
  });
  if (!e) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.exposure.close',
    payload: { id: exposureId, status: parsed.data.status },
  });
  return NextResponse.json({ exposure: e });
}
