/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/alerts
 *
 * GET  — list alerts for the authenticated user.
 * POST — create a new alert (e.g., injected from an external SIEM webhook).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listAlerts, createAlert, recordAudit } from '@/lib/agentic-os/cyber/repo';

const AlertBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  category: z.enum(['authentication', 'network', 'malware', 'data_exfiltration', 'privilege_escalation', 'vulnerability', 'policy_violation', 'other']),
  status: z.enum(['open', 'investigating', 'resolved', 'false_positive']).optional(),
  source: z.string().max(200).optional(),
  sourceIp: z.string().ip().nullable().optional(),
  assignedTo: z.string().max(320).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  occurredAt: z.string().datetime().optional(),
});

export async function GET() {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const alerts = await listAlerts(user.userId);
  return NextResponse.json({ alerts });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = AlertBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const alert = await createAlert(user.userId, parsed.data);
  await recordAudit({ actorId: user.userId, action: 'cyber.alert.created', payload: { id: alert.id } });

  return NextResponse.json({ alert }, { status: 201 });
}
