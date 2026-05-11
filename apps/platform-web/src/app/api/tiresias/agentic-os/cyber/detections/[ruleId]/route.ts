/**
 * CyberSec OS - /api/tiresias/agentic-os/cyber/detections/[ruleId]
 *
 * GET  - fetch single detection rule by id.
 * PATCH - update detection rule.
 * DELETE - delete detection rule.
 *
 * @license MIT - Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  getDetectionRule,
  updateDetectionRule,
  deleteDetectionRule,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';
import {
  DETECTION_LIFECYCLE_VALUES,
  DETECTION_SEVERITY_VALUES,
  DETECTION_LOG_SOURCE_KIND_VALUES,
} from '@/lib/agentic-os/cyber/detections';

// Shared schema for detection rule fields (without required name for PATCH)
const DetectionRuleFields = z.object({
  name: z.string().min(1).max(200).optional(),
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

// PATCH body: all fields optional
const DetectionRulePatchBody = DetectionRuleFields.partial();

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ ruleId: string }> }
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { ruleId } = await ctx.params;

  const rule = await getDetectionRule(ruleId, user.userId);
  if (!rule) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ rule });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ ruleId: string }> }
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { ruleId } = await ctx.params;

  const parsed = DetectionRulePatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updatedRule = await updateDetectionRule(ruleId, user.userId, parsed.data);
  if (!updatedRule) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.detection.update',
    payload: { id: ruleId, patch: Object.keys(parsed.data) },
  });
  return NextResponse.json({ rule: updatedRule });
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ ruleId: string }> }
) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { ruleId } = await ctx.params;

  const deleted = await deleteDetectionRule(ruleId, user.userId);
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.detection.delete',
    payload: { id: ruleId },
  });
  return NextResponse.json({ ok: true });
}
