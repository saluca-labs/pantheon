/**
 * CyberSec OS - /api/tiresias/agentic-os/cyber/detections
 *
 * GET  - list detection rules (filterable by lifecycle, severity, q).
 * POST - create a detection rule.
 *
 * @license MIT - Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  listDetectionRules,
  createDetectionRule,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';
import {
  DETECTION_LIFECYCLE_VALUES,
  DETECTION_SEVERITY_VALUES,
  DETECTION_LOG_SOURCE_KIND_VALUES,
  type DetectionLifecycle,
  type DetectionSeverity,
} from '@/lib/agentic-os/cyber/detections';

const DetectionRuleBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(8000).nullable().optional(),
  author: z.string().max(120).nullable().optional(),
  lifecycle: z.enum(DETECTION_LIFECYCLE_VALUES).optional(),
  severity: z.enum(DETECTION_SEVERITY_VALUES).optional(),
  tactic: z.string().max(120).nullable().optional(),
  technique: z.string().max(120).nullable().optional(),
  logSourceKind: z.enum(DETECTION_LOG_SOURCE_KIND_VALUES).nullable().optional(),
  detection: z.record(z.string(), z.unknown()).optional(),
  falsePositives: z.array(z.string().min(1).max(500)).max(64).optional(),
  references: z.array(z.string().url().max(500)).max(32).optional(),
  tags: z.array(z.string().min(1).max(60)).max(32).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const lifecycleRaw = sp.get('lifecycle');
  const severityRaw = sp.get('severity');
  const q = sp.get('q') ?? undefined;

  const lifecycle =
    lifecycleRaw && (DETECTION_LIFECYCLE_VALUES as readonly string[]).includes(lifecycleRaw)
      ? (lifecycleRaw as DetectionLifecycle)
      : undefined;
  const severity =
    severityRaw && (DETECTION_SEVERITY_VALUES as readonly string[]).includes(severityRaw)
      ? (severityRaw as DetectionSeverity)
      : undefined;

  const rules = await listDetectionRules({
    ownerId: user.userId,
    lifecycle,
    severity,
    q,
  });

  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = DetectionRuleBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const rule = await createDetectionRule(user.userId, parsed.data);
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.detection.create',
    payload: { id: rule.id, severity: rule.severity, lifecycle: rule.lifecycle },
  });
  return NextResponse.json({ rule }, { status: 201 });
}
