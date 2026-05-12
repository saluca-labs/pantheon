/**
 * Business OS Phase 3 — projects collection route.
 *
 * GET  /api/tiresias/agentic-os/business/projects
 *   List projects scoped to the caller.  Default excludes archived rows.
 *   Query:
 *     ?archived=true          include archived
 *     ?status=<values>        comma-separated ProjectStatus values
 *     ?billing_model=<value>  filter by billing model
 *     ?contact_id=<uuid>      scope to one contact
 *     ?deal_id=<uuid>         scope to one deal
 *     ?tag=<value>            single-tag ANY-match (case-insensitive)
 *     ?q=<text>               free-text search across title/description_md
 *     ?limit=<n>&offset=<n>   pagination (limit 1..500)
 *
 * POST /api/tiresias/agentic-os/business/projects
 *   Create a new project.  Audits `business.project.created`.
 *
 * @license MIT — Tiresias Business OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { listProjects, createProject } from '@/lib/agentic-os/business/projects-repo';
import {
  PROJECT_STATUSES,
  BILLING_MODELS,
  type ProjectStatus,
  type BillingModel,
} from '@/lib/agentic-os/business/projects';

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  contact_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  description_md: z.string().max(50_000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  billing_model: z.enum(BILLING_MODELS).optional(),
  default_rate_cents: z.number().int().nullable().optional(),
  budget_cents: z.number().int().nullable().optional(),
  currency: z.string().min(1).max(3).optional(),
  start_date: z.string().nullable().optional(),
  target_completion_date: z.string().nullable().optional(),
  cover_image_url: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(50).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const archivedParam = url.searchParams.get('archived');
  const statusParam = url.searchParams.get('status');
  const billingModelParam = url.searchParams.get('billing_model');
  const contactIdParam = url.searchParams.get('contact_id');
  const dealIdParam = url.searchParams.get('deal_id');
  const tagParam = url.searchParams.get('tag');
  const qParam = url.searchParams.get('q');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (contactIdParam && !/^[0-9a-f-]{36}$/i.test(contactIdParam)) {
    return NextResponse.json({ error: 'contact_id must be a UUID' }, { status: 400 });
  }
  if (dealIdParam && !/^[0-9a-f-]{36}$/i.test(dealIdParam)) {
    return NextResponse.json({ error: 'deal_id must be a UUID' }, { status: 400 });
  }
  if (statusParam) {
    const statuses = statusParam.split(',').map((s) => s.trim());
    for (const s of statuses) {
      if (!(PROJECT_STATUSES as readonly string[]).includes(s)) {
        return NextResponse.json(
          { error: `Invalid status: "${s}". Valid: ${PROJECT_STATUSES.join(', ')}` },
          { status: 400 },
        );
      }
    }
  }
  if (billingModelParam) {
    if (!(BILLING_MODELS as readonly string[]).includes(billingModelParam)) {
      return NextResponse.json(
        { error: `Invalid billing_model: "${billingModelParam}". Valid: ${BILLING_MODELS.join(', ')}` },
        { status: 400 },
      );
    }
  }

  const limit = limitParam ? Number(limitParam) : undefined;
  const offset = offsetParam ? Number(offsetParam) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 500)) {
    return NextResponse.json({ error: 'Invalid limit (1..500)' }, { status: 400 });
  }
  if (offset !== undefined && (!Number.isFinite(offset) || offset < 0)) {
    return NextResponse.json({ error: 'Invalid offset (>= 0)' }, { status: 400 });
  }

  const projects = await listProjects(user.userId, {
    archived: archivedParam === 'true',
    status: statusParam
      ? (statusParam.split(',').map((s) => s.trim()) as ProjectStatus[])
      : undefined,
    billingModel: (billingModelParam as BillingModel) ?? undefined,
    contactId: contactIdParam ?? undefined,
    dealId: dealIdParam ?? undefined,
    tag: tagParam ?? undefined,
    q: qParam ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({ projects });
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
  const project = await createProject(user.userId, {
    title: d.title,
    slug: d.slug ?? undefined as any,
    contactId: d.contact_id,
    dealId: d.deal_id,
    descriptionMd: d.description_md,
    status: d.status,
    billingModel: d.billing_model,
    defaultRateCents: d.default_rate_cents,
    budgetCents: d.budget_cents,
    currency: d.currency,
    startDate: d.start_date,
    targetCompletionDate: d.target_completion_date,
    coverImageUrl: d.cover_image_url,
    tags: d.tags,
    metadata: d.metadata,
  });
  await recordAudit({
    actorId: user.userId,
    action: 'business.project.created',
    payload: { projectId: project.id },
  });
  return NextResponse.json({ project }, { status: 201 });
}
