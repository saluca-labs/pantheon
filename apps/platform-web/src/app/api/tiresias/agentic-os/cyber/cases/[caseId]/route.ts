/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/cases/[caseId]
 *
 * GET    — case detail (with linkedAlerts, events, evidence, tasks).
 * PATCH  — update case fields (auto-events for status/severity/priority/assignment).
 * DELETE — hard delete (cascades children).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  getCaseDetail,
  updateCase,
  deleteCase,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';
import {
  CASE_SEVERITY_VALUES,
  CASE_STATUS_VALUES,
  CASE_PRIORITY_VALUES,
} from '@/lib/agentic-os/cyber/cases';

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(8000).nullable().optional(),
  severity: z.enum(CASE_SEVERITY_VALUES).optional(),
  status: z.enum(CASE_STATUS_VALUES).optional(),
  priority: z.enum(CASE_PRIORITY_VALUES).optional(),
  assignedTo: z.string().max(120).nullable().optional(),
  tactic: z.string().max(120).nullable().optional(),
  technique: z.string().max(120).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(32).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const detail = await getCaseDetail(caseId, user.userId);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ case: detail });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const c = await updateCase(caseId, user.userId, parsed.data);
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.case.update',
    payload: { id: caseId, fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ case: c });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ok = await deleteCase(caseId, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.case.delete',
    payload: { id: caseId },
  });
  return NextResponse.json({ ok: true });
}
