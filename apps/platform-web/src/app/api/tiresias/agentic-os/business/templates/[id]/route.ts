/**
 * Business OS Phase 6 — single template route.
 *
 * GET    /api/tiresias/agentic-os/business/templates/[id]
 * PATCH  /api/tiresias/agentic-os/business/templates/[id]
 * DELETE /api/tiresias/agentic-os/business/templates/[id]
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getTemplate,
  updateTemplate,
  deleteTemplate,
} from '@/lib/agentic-os/business/doc-templates-repo';
import { DOC_TEMPLATE_KINDS } from '@/lib/agentic-os/business/doc-templates';

const UpdateBody = z.object({
  title: z.string().min(1).max(300).optional(),
  kind: z.enum(DOC_TEMPLATE_KINDS).optional(),
  body_md: z.string().max(100_000).optional(),
  version: z.string().max(20).optional(),
  tags: z.array(z.string()).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const template = await getTemplate(id, user.userId);
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ template });
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

  const result = await updateTemplate(id, user.userId, parsed.data);
  if (result.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.template.updated',
    payload: { templateId: id },
  });

  return NextResponse.json({ template: result.template });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const result = await deleteTemplate(id, user.userId);
  if (result.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.template.deleted',
    payload: { templateId: id },
  });

  return NextResponse.json({ ok: true });
}
