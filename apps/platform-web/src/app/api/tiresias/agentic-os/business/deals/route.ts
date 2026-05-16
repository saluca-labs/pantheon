/**
 * Business OS Phase 2 — deals collection route.
 *
 * GET  /api/tiresias/agentic-os/business/deals
 *   List deals scoped to the caller.  Default excludes archived rows.
 *   Query:
 *     ?archived=true          include archived
 *     ?stage=<value>          filter by single stage
 *     ?contact_id=<uuid>      scope to one contact
 *     ?organization_id=<uuid> scope to one org
 *     ?source=<value>         filter by source
 *     ?tag=<value>            single-tag ANY-match (case-insensitive)
 *     ?open=true              only open deals (stage NOT won/lost)
 *     ?include=forecast       include weighted_value_cents + pipeline summary
 *     ?q=<text>               free-text search across title/description/lost_reason
 *     ?limit=<n>&offset=<n>   pagination (limit 1..500)
 *
 * POST /api/tiresias/agentic-os/business/deals
 *   Create a new deal.  Audits `business.deal.created`.
 *
 * @license MIT — Tiresias Business OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { listDeals, createDeal } from '@/lib/agentic-os/business/deals-repo';
import {
  DEAL_STAGES,
  computePipelineForecast,
  computeWeightedValue,
  type Deal,
  type DealStage,
  type DealWithForecast,
  type PipelineForecast,
} from '@/lib/agentic-os/business/deals';

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  contact_id: z.string().uuid().nullable().optional(),
  organization_id: z.string().uuid().nullable().optional(),
  description_md: z.string().max(50_000).optional(),
  stage: z.enum(DEAL_STAGES).optional(),
  value_cents: z.number().int().nullable().optional(),
  currency: z.string().min(1).max(3).optional(),
  probability_pct: z.number().int().min(0).max(100).optional(),
  expected_close_date: z.string().nullable().optional(),
  source: z.string().max(100).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(50).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const archivedParam = url.searchParams.get('archived');
  const stageParam = url.searchParams.get('stage');
  const contactIdParam = url.searchParams.get('contact_id');
  const orgIdParam = url.searchParams.get('organization_id');
  const sourceParam = url.searchParams.get('source');
  const tagParam = url.searchParams.get('tag');
  const openParam = url.searchParams.get('open');
  const includeParam = url.searchParams.get('include');
  const qParam = url.searchParams.get('q');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (contactIdParam && !/^[0-9a-f-]{36}$/i.test(contactIdParam)) {
    return NextResponse.json({ error: 'contact_id must be a UUID' }, { status: 400 });
  }
  if (orgIdParam && !/^[0-9a-f-]{36}$/i.test(orgIdParam)) {
    return NextResponse.json({ error: 'organization_id must be a UUID' }, { status: 400 });
  }
  if (stageParam) {
    const stages = stageParam.split(',').map((s) => s.trim());
    for (const s of stages) {
      if (!(DEAL_STAGES as readonly string[]).includes(s)) {
        return NextResponse.json(
          { error: `Invalid stage: "${s}". Valid: ${DEAL_STAGES.join(', ')}` },
          { status: 400 },
        );
      }
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

  const deals = await listDeals(user.userId, {
    archived: archivedParam === 'true',
    stage: stageParam
      ? (stageParam.split(',').map((s) => s.trim()) as DealStage[])
      : undefined,
    contactId: contactIdParam ?? undefined,
    organizationId: orgIdParam ?? undefined,
    source: sourceParam ?? undefined,
    tag: tagParam ?? undefined,
    open: openParam === 'true',
    q: qParam ?? undefined,
    limit,
    offset,
  });

  const response: { deals: Deal[] | DealWithForecast[]; forecast?: PipelineForecast } = { deals };

  if (includeParam === 'forecast') {
    const dealsWithForecast: DealWithForecast[] = deals.map((d) => ({
      ...d,
      weightedValueCents: computeWeightedValue(d.valueCents, d.probabilityPct),
    }));
    response.deals = dealsWithForecast;
    response.forecast = computePipelineForecast(deals);
  }

  return NextResponse.json(response);
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
  const deal = await createDeal(user.userId, {
    title: d.title,
    contactId: d.contact_id,
    organizationId: d.organization_id,
    descriptionMd: d.description_md,
    stage: d.stage,
    valueCents: d.value_cents,
    currency: d.currency,
    probabilityPct: d.probability_pct,
    expectedCloseDate: d.expected_close_date,
    source: d.source,
    tags: d.tags,
    metadata: d.metadata,
  });
  await recordAudit({
    actorId: user.userId,
    action: 'business.deal.created',
    payload: { dealId: deal.id },
  });
  return NextResponse.json({ deal }, { status: 201 });
}
