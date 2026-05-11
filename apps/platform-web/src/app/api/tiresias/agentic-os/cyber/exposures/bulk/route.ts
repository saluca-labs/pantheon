/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/exposures/bulk
 *
 * POST — body: { vulnerabilityId, assetIds[], priority?, detectedBy? }
 * Creates one exposure per asset for the given vuln, idempotent via the
 * (vulnerability_id, asset_id) unique constraint.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  bulkCreateExposures,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';
import { EXPOSURE_PRIORITY_VALUES } from '@/lib/agentic-os/cyber/exposures';

const BulkBody = z.object({
  vulnerabilityId: z.string().uuid(),
  assetIds: z.array(z.string().uuid()).min(1).max(500),
  priority: z.enum(EXPOSURE_PRIORITY_VALUES).optional(),
  detectedBy: z.string().max(120).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = BulkBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const counts = await bulkCreateExposures({
    ownerId: user.userId,
    vulnerabilityId: parsed.data.vulnerabilityId,
    assetIds: parsed.data.assetIds,
    priority: parsed.data.priority,
    detectedBy: parsed.data.detectedBy ?? null,
  });
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.exposure.bulk_create',
    payload: {
      vulnerabilityId: parsed.data.vulnerabilityId,
      requested: parsed.data.assetIds.length,
      created: counts.created,
      skipped: counts.skipped,
    },
  });
  return NextResponse.json(counts, { status: 201 });
}
