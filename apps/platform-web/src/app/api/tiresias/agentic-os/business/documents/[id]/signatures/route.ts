/**
 * Business OS Phase 6 — document signatures route.
 *
 * GET  /api/tiresias/agentic-os/business/documents/[id]/signatures
 * POST /api/tiresias/agentic-os/business/documents/[id]/signatures
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { getDocument } from '@/lib/agentic-os/business/documents-repo';
import {
  listSignatures,
  captureSignature,
} from '@/lib/agentic-os/business/signatures-repo';
import { SIGNER_ROLES } from '@/lib/agentic-os/business/signatures';

const CaptureBody = z.object({
  signer_role: z.enum(SIGNER_ROLES).optional(),
  signer_name: z.string().min(1).max(200),
  signer_email: z.string().email().nullable().optional(),
  signature_image_url: z.string().min(1),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Validate document ownership
  const doc = await getDocument(id, user.userId);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const signatures = await listSignatures(id, user.userId);
  return NextResponse.json({ signatures });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const parsed = CaptureBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const result = await captureSignature(user.userId, id, {
    signerRole: d.signer_role,
    signerName: d.signer_name,
    signerEmail: d.signer_email ?? null,
    signatureImageUrl: d.signature_image_url,
  });

  if (result.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (result.kind === 'invalid_transition') {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.signature.captured',
    payload: { documentId: id, signatureId: result.signature.id, signerRole: result.signature.signerRole },
  });

  if (result.document) {
    await recordAudit({
      actorId: user.userId,
      action: 'business.document.signed',
      payload: { documentId: id },
    });
  }

  return NextResponse.json({
    signature: result.signature,
    document: result.document ?? null,
  });
}
