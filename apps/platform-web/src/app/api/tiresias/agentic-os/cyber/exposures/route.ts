/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/exposures
 *
 * GET  — list exposures (?status=&priority=&assetId=&vulnerabilityId=).
 * POST — create exposure.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  createExposure,
  listExposures,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';
import {
  EXPOSURE_PRIORITY_VALUES,
  EXPOSURE_STATUS_VALUES,
  type ExposurePriority,
  type ExposureStatus,
} from '@/lib/agentic-os/cyber/exposures';

const ExposureBody = z.object({
  vulnerabilityId: z.string().uuid(),
  assetId: z.string().uuid(),
  status: z.enum(EXPOSURE_STATUS_VALUES).optional(),
  detectedBy: z.string().max(120).nullable().optional(),
  assignedTo: z.string().max(120).nullable().optional(),
  priority: z.enum(EXPOSURE_PRIORITY_VALUES).optional(),
  notes: z.string().max(16000).nullable().optional(),
  evidenceUrl: z.string().url().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const statusRaw = sp.get('status');
  const priorityRaw = sp.get('priority');
  const status = statusRaw && (EXPOSURE_STATUS_VALUES as readonly string[]).includes(statusRaw)
    ? (statusRaw as ExposureStatus)
    : undefined;
  const priority = priorityRaw && (EXPOSURE_PRIORITY_VALUES as readonly string[]).includes(priorityRaw)
    ? (priorityRaw as ExposurePriority)
    : undefined;
  const assetId = sp.get('assetId') ?? undefined;
  const vulnerabilityId = sp.get('vulnerabilityId') ?? undefined;

  const exposures = await listExposures({
    ownerId: user.userId,
    status,
    priority,
    assetId,
    vulnerabilityId,
  });
  return NextResponse.json({ exposures });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = ExposureBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const exposure = await createExposure(user.userId, parsed.data);
  if (!exposure) {
    return NextResponse.json(
      { error: 'Vulnerability or asset not found, or exposure already exists' },
      { status: 409 },
    );
  }
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.exposure.create',
    payload: { id: exposure.id, vulnerabilityId: exposure.vulnerabilityId, assetId: exposure.assetId },
  });
  return NextResponse.json({ exposure }, { status: 201 });
}
