/**
 * Business OS Phase 6 — single document route.
 *
 * GET    /api/tiresias/agentic-os/business/documents/[id]
 * PATCH  /api/tiresias/agentic-os/business/documents/[id]
 * DELETE /api/tiresias/agentic-os/business/documents/[id]
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getDocument,
  updateDocument,
  deleteDocument,
} from '@/lib/agentic-os/business/documents-repo';

const UpdateBody = z.object({
  title: z.string().min(1).max(300).optional(),
  body_md: z.string().max(100_000).optional(),
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const document = await getDocument(id, user.userId);
  if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ document });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const parsed = UpdateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await updateDocument(id, user.userId, {
    title: parsed.data.title,
    bodyMd: parsed.data.body_md,
    contactId: parsed.data.contact_id,
    projectId: parsed.data.project_id,
    dealId: parsed.data.deal_id,
    metadata: parsed.data.metadata,
  });

  if (result.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (result.kind === 'not_draft') {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.document.updated',
    payload: { documentId: id },
  });

  return NextResponse.json({ document: result.doc });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const result = await deleteDocument(id, user.userId);
  if (result.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.document.deleted',
    payload: { documentId: id },
  });

  return NextResponse.json({ ok: true });
}
