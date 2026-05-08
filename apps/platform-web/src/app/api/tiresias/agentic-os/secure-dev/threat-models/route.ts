/**
 * Secure-Dev OS — /api/tiresias/agentic-os/secure-dev/threat-models
 *
 * GET  — list saved threat models for the authenticated user.
 * POST — save a new STRIDE checklist generated on the client.
 *
 * @license MIT — Tiresias Secure-Dev OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentSecureDevUser } from '@/lib/agentic-os/secure-dev/session';
import { listThreatModels, saveThreatModel, recordAudit } from '@/lib/agentic-os/secure-dev/repo';

const ThreatModelBody = z.object({
  systemName: z.string().min(1).max(200),
  systemDescription: z.string().min(1).max(10000),
  checklist: z.object({
    systemDescription: z.string(),
    generatedAt: z.string(),
    threats: z.array(z.object({
      id: z.string(),
      category: z.string(),
      title: z.string(),
      description: z.string(),
      mitigations: z.array(z.string()),
      severity: z.enum(['high', 'medium', 'low']),
      referenceUrl: z.string(),
      triggered: z.boolean(),
    })),
  }),
});

export async function GET() {
  const user = await getCurrentSecureDevUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const models = await listThreatModels(user.userId);
  return NextResponse.json({ models });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentSecureDevUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = ThreatModelBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const model = await saveThreatModel({
    userId: user.userId,
    systemName: parsed.data.systemName,
    systemDescription: parsed.data.systemDescription,
    checklist: parsed.data.checklist as any,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'secure-dev.threat-model.created',
    payload: { id: model.id, systemName: model.systemName },
  });

  return NextResponse.json({ model }, { status: 201 });
}
