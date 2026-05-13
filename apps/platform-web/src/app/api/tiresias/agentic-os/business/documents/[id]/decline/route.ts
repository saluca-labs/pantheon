/**
 * Business OS Phase 6 — document decline route.
 *
 * POST /api/tiresias/agentic-os/business/documents/[id]/decline
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { declineDocument } from '@/lib/agentic-os/business/documents-repo';

const DeclineBody = z.object({
  reason: z.string().max(1000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const parsed = DeclineBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await declineDocument(id, user.userId);

  if (result.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (result.kind === 'invalid_transition') {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.document.declined',
    payload: { documentId: id, reason: parsed.data.reason ?? null },
  });

  return NextResponse.json({ document: result.doc });
}
