/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/cases
 *
 * GET  — list cases (filterable by status, severity, priority, q).
 * POST — create a new case.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listCases, createCase, recordAudit } from '@/lib/agentic-os/cyber/repo';
import {
  CASE_SEVERITY_VALUES,
  CASE_STATUS_VALUES,
  CASE_PRIORITY_VALUES,
  type CaseSeverity,
  type CaseStatus,
  type CasePriority,
} from '@/lib/agentic-os/cyber/cases';

const CaseBody = z.object({
  title: z.string().min(1).max(200),
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

export async function GET(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const status = sp.get('status');
  const severity = sp.get('severity');
  const priority = sp.get('priority');
  const q = sp.get('q') ?? undefined;

  const cases = await listCases({
    ownerId: user.userId,
    q,
    status: status && (CASE_STATUS_VALUES as readonly string[]).includes(status) ? (status as CaseStatus) : undefined,
    severity: severity && (CASE_SEVERITY_VALUES as readonly string[]).includes(severity) ? (severity as CaseSeverity) : undefined,
    priority: priority && (CASE_PRIORITY_VALUES as readonly string[]).includes(priority) ? (priority as CasePriority) : undefined,
  });
  return NextResponse.json({ cases });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = CaseBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const c = await createCase(user.userId, parsed.data);
  await recordAudit({
    actorId: user.userId,
    action: 'cyber.case.create',
    payload: { id: c.id, severity: c.severity, status: c.status },
  });
  return NextResponse.json({ case: c }, { status: 201 });
}
