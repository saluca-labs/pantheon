/**
 * Business OS Phase 6 — templates collection route.
 *
 * GET  /api/tiresias/agentic-os/business/templates
 * POST /api/tiresias/agentic-os/business/templates
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  listTemplates,
  createTemplate,
} from '@/lib/agentic-os/business/doc-templates-repo';
import { DOC_TEMPLATE_KINDS, type DocTemplateKind } from '@/lib/agentic-os/business/doc-templates';

const CreateBody = z.object({
  title: z.string().min(1).max(300),
  kind: z.enum(DOC_TEMPLATE_KINDS).optional(),
  body_md: z.string().max(100_000).optional(),
  version: z.string().max(20).optional(),
  tags: z.array(z.string()).max(100).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const kindParam = url.searchParams.get('kind');
  const qParam = url.searchParams.get('q');
  const tagParam = url.searchParams.get('tag');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (kindParam && !(DOC_TEMPLATE_KINDS as readonly string[]).includes(kindParam)) {
    return NextResponse.json(
      { error: `Invalid kind: "${kindParam}". Valid: ${DOC_TEMPLATE_KINDS.join(', ')}` },
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

  const templates = await listTemplates(user.userId, {
    kind: (kindParam as DocTemplateKind | null) ?? undefined,
    q: qParam ?? undefined,
    tag: tagParam ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({ templates });
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

  const template = await createTemplate(user.userId, {
    title: d.title,
    kind: d.kind,
    bodyMd: d.body_md,
    version: d.version,
    tags: d.tags,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'business.template.created',
    payload: { templateId: template.id },
  });

  return NextResponse.json({ template }, { status: 201 });
}
