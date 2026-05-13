/**
 * Business OS Phase 6 — documents collection route.
 *
 * GET  /api/tiresias/agentic-os/business/documents
 * POST /api/tiresias/agentic-os/business/documents
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  listDocuments,
  createDocument,
} from '@/lib/agentic-os/business/documents-repo';
import { DOCUMENT_STATUSES } from '@/lib/agentic-os/business/documents';

const CreateBody = z.object({
  title: z.string().min(1).max(300),
  template_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  body_md: z.string().max(100_000).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const kindParam = url.searchParams.get('kind');
  const projectIdParam = url.searchParams.get('project_id');
  const dealIdParam = url.searchParams.get('deal_id');
  const contactIdParam = url.searchParams.get('contact_id');
  const qParam = url.searchParams.get('q');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (statusParam && !(DOCUMENT_STATUSES as readonly string[]).includes(statusParam)) {
    return NextResponse.json(
      { error: `Invalid status: "${statusParam}". Valid: ${DOCUMENT_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  const limit = limitParam ? Number(limitParam) : undefined;
  const offset = offsetParam ? Number(offsetParam) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 500)) {
    return NextResponse.json({ error: 'Invalid limit (1..500)' }, { status: 400 });
  }
  if (offset !== undefined && (!Number.isFinite(offset) || offset < 0)) {
    return NextResponse.json({ error: 'Invalid offset (>= 0)' }, { status: 400 });
  }

  const documents = await listDocuments(user.userId, {
    status: statusParam as any,
    kind: kindParam ?? undefined,
    projectId: projectIdParam ?? undefined,
    dealId: dealIdParam ?? undefined,
    contactId: contactIdParam ?? undefined,
    q: qParam ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({ documents });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const document = await createDocument(user.userId, {
    title: d.title,
    templateId: d.template_id ?? null,
    projectId: d.project_id ?? null,
    dealId: d.deal_id ?? null,
    contactId: d.contact_id ?? null,
    bodyMd: d.body_md,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'business.document.created',
    payload: { documentId: document.id },
  });

  return NextResponse.json({ document }, { status: 201 });
}
