/**
 * Business OS Phase 3 — single project route.
 *
 * GET    /api/tiresias/agentic-os/business/projects/[id]
 * PATCH  /api/tiresias/agentic-os/business/projects/[id]
 *   Partial update.  `archived: true` soft-archives (audits as
 *   `business.project.archived`).  `archived: false` is rejected with a
 *   pointer to the restore endpoint.
 * DELETE /api/tiresias/agentic-os/business/projects/[id]
 *   Soft-archive (no hard delete).  Audits `business.project.archived`.
 *
 * @license MIT — Tiresias Business OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getProject,
  updateProject,
  archiveProject,
} from '@/lib/agentic-os/business/projects-repo';
import { PROJECT_STATUSES, BILLING_MODELS } from '@/lib/agentic-os/business/projects';

const PatchBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
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
    archived: z.boolean().optional(),
  })
  .strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const project = await getProject(id, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getProject(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  if (d.archived === true) {
    const archived = await archiveProject(id, user.userId);
    if (!archived) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'business.project.archived',
      payload: { projectId: id },
    });
    return NextResponse.json({ project: archived });
  }
  if (d.archived === false) {
    return NextResponse.json(
      {
        error: 'Use POST /projects/[id]/restore to un-archive',
        restorePath: `/api/tiresias/agentic-os/business/projects/${id}/restore`,
      },
      { status: 400 },
    );
  }

  const { archived: _drop, ...rest } = d;
  const outcome = await updateProject(id, user.userId, {
    title: rest.title,
    slug: rest.slug,
    contactId: rest.contact_id as any,
    dealId: rest.deal_id as any,
    descriptionMd: rest.description_md,
    status: rest.status,
    billingModel: rest.billing_model,
    defaultRateCents: rest.default_rate_cents as any,
    budgetCents: rest.budget_cents as any,
    currency: rest.currency,
    startDate: rest.start_date as any,
    targetCompletionDate: rest.target_completion_date as any,
    coverImageUrl: rest.cover_image_url as any,
    tags: rest.tags,
    metadata: rest.metadata,
  });
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'business.project.updated',
    payload: { projectId: id, fields: Object.keys(rest) },
  });
  return NextResponse.json({ project: outcome.project });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await getProject(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const archived = await archiveProject(id, user.userId);
  if (!archived) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'business.project.archived',
    payload: { projectId: id },
  });
  return NextResponse.json({ project: archived });
}
