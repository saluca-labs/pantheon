/**
 * Business OS Phase 6 — document send route.
 *
 * POST /api/tiresias/agentic-os/business/documents/[id]/send
 *
 * Transitions a draft document to sent status.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { sendDocument } from '@/lib/agentic-os/business/documents-repo';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const result = await sendDocument(id, user.userId);

  if (result.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (result.kind === 'invalid_transition') {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.document.sent',
    payload: { documentId: id },
  });

  return NextResponse.json({ document: result.doc });
}
