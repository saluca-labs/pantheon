/**
 * Business OS Phase 2 — single deal route.
 *
 * GET    /api/tiresias/agentic-os/business/deals/[id]
 * PATCH  /api/tiresias/agentic-os/business/deals/[id]
 *   Partial update.  `archived: true` soft-archives (audits as
 *   `business.deal.archived`).  `archived: false` is rejected with a
 *   pointer to the restore endpoint.
 * DELETE /api/tiresias/agentic-os/business/deals/[id]
 *   Soft-archive (no hard delete).  Audits `business.deal.archived`.
 *
 * @license MIT — Tiresias Business OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getDeal,
  updateDeal,
  archiveDeal,
} from '@/lib/agentic-os/business/deals-repo';
import { DEAL_STAGES } from '@/lib/agentic-os/business/deals';

const PatchBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
    contact_id: z.string().uuid().nullable().optional(),
    organization_id: z.string().uuid().nullable().optional(),
    description_md: z.string().max(50_000).optional(),
    stage: z.enum(DEAL_STAGES).optional(),
    value_cents: z.number().int().nullable().optional(),
    currency: z.string().min(1).max(3).optional(),
    probability_pct: z.number().int().min(0).max(100).optional(),
    expected_close_date: z.string().nullable().optional(),
    lost_reason: z.string().max(500).nullable().optional(),
    source: z.string().max(100).nullable().optional(),
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
  const deal = await getDeal(id, user.userId);
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ deal });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getDeal(id, user.userId);
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
    const archived = await archiveDeal(id, user.userId);
    if (!archived) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'business.deal.archived',
      payload: { dealId: id },
    });
    return NextResponse.json({ deal: archived });
  }
  if (d.archived === false) {
    return NextResponse.json(
      {
        error: 'Use POST /deals/[id]/restore to un-archive',
        restorePath: `/api/tiresias/agentic-os/business/deals/${id}/restore`,
      },
      { status: 400 },
    );
  }

  const { archived: _drop, ...rest } = d;
  const outcome = await updateDeal(id, user.userId, {
    title: rest.title,
    contactId: rest.contact_id,
    organizationId: rest.organization_id,
    descriptionMd: rest.description_md,
    stage: rest.stage,
    valueCents: rest.value_cents,
    currency: rest.currency,
    probabilityPct: rest.probability_pct,
    expectedCloseDate: rest.expected_close_date,
    lostReason: rest.lost_reason,
    source: rest.source,
    tags: rest.tags,
    metadata: rest.metadata,
  });
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'business.deal.updated',
    payload: { dealId: id, fields: Object.keys(rest) },
  });
  return NextResponse.json({ deal: outcome.deal });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await getDeal(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const archived = await archiveDeal(id, user.userId);
  if (!archived) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'business.deal.archived',
    payload: { dealId: id },
  });
  return NextResponse.json({ deal: archived });
}
