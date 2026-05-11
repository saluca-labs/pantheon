/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/cases/[caseId]/evidence
 *
 * GET  — list evidence for a case.
 * POST — add evidence.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import {
  listEvidence,
  addEvidence,
  recordAudit,
} from '@/lib/agentic-os/cyber/repo';
import { EVIDENCE_KIND_VALUES } from '@/lib/agentic-os/cyber/cases';

const EvidenceBody = z.object({
  kind: z.enum(EVIDENCE_KIND_VALUES),
  title: z.string().min(1).max(200),
  description: z.string().max(8000).nullable().optional(),
  url: z.string().max(2048).nullable().optional(),
  content: z.string().max(100_000).nullable().optional(),
  mimeType: z.string().max(120).nullable().optional(),
  sha256: z.string().max(64).nullable().optional(),
  collectedAt: z.string().datetime().optional(),
  collectedBy: z.string().max(120).nullable().optional(),
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

  const evidence = await listEvidence(caseId, user.userId);
  return NextResponse.json({ evidence });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = EvidenceBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const evidence = await addEvidence({
    ownerId: user.userId,
    caseId,
    ...parsed.data,
  });
  if (!evidence) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.evidence.add',
    payload: { caseId, id: evidence.id, kind: evidence.kind },
  });
  return NextResponse.json({ evidence }, { status: 201 });
}
