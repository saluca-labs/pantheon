/**
 * Business OS Phase 1 — interactions collection route.
 *
 * GET  /api/tiresias/agentic-os/business/interactions
 *   Workshop-wide feed (default order: occurred_at DESC, limit 100).
 *   Query:
 *     ?person_id=<uuid>          scope to one person
 *     ?organization_id=<uuid>    scope to one org
 *     ?deal_id=<uuid>            scope to one deal
 *     ?interaction_type=<one of 9>
 *     ?from=<iso>  ?to=<iso>     inclusive window
 *     ?limit=<n>&offset=<n>      pagination (limit 1..500)
 *
 * POST /api/tiresias/agentic-os/business/interactions
 *   Create.  Audits `business.interaction.created`.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  listInteractions,
  createInteraction,
} from '@/lib/agentic-os/business/interactions-repo';
import { INTERACTION_TYPES } from '@/lib/agentic-os/business/crm';

const CreateBody = z.object({
  person_id: z.string().uuid().nullable().optional(),
  organization_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  interaction_type: z.enum(INTERACTION_TYPES as unknown as [string, ...string[]]),
  summary: z.string().min(1).max(2000),
  occurred_at: z.string().datetime().optional(),
});

function isIsoLike(value: string): boolean {
  // Accept date-only or date+time.  Strict is enforced by the DB.
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(value);
}

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const personIdParam = url.searchParams.get('person_id');
  const orgIdParam = url.searchParams.get('organization_id');
  const dealIdParam = url.searchParams.get('deal_id');
  const typeParam = url.searchParams.get('interaction_type');
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (personIdParam && !/^[0-9a-f-]{36}$/i.test(personIdParam)) {
    return NextResponse.json({ error: 'person_id must be a UUID' }, { status: 400 });
  }
  if (orgIdParam && !/^[0-9a-f-]{36}$/i.test(orgIdParam)) {
    return NextResponse.json({ error: 'organization_id must be a UUID' }, { status: 400 });
  }
  if (dealIdParam && !/^[0-9a-f-]{36}$/i.test(dealIdParam)) {
    return NextResponse.json({ error: 'deal_id must be a UUID' }, { status: 400 });
  }
  if (typeParam && !(INTERACTION_TYPES as readonly string[]).includes(typeParam)) {
    return NextResponse.json(
      { error: `Invalid interaction_type filter: ${typeParam}` },
      { status: 400 },
    );
  }
  if (fromParam && !isIsoLike(fromParam)) {
    return NextResponse.json({ error: 'from must be an ISO date' }, { status: 400 });
  }
  if (toParam && !isIsoLike(toParam)) {
    return NextResponse.json({ error: 'to must be an ISO date' }, { status: 400 });
  }

  const limit = limitParam ? Number(limitParam) : undefined;
  const offset = offsetParam ? Number(offsetParam) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 500)) {
    return NextResponse.json({ error: 'Invalid limit (1..500)' }, { status: 400 });
  }
  if (offset !== undefined && (!Number.isFinite(offset) || offset < 0)) {
    return NextResponse.json({ error: 'Invalid offset (>= 0)' }, { status: 400 });
  }

  const interactions = await listInteractions(user.userId, {
    personId: personIdParam ?? undefined,
    organizationId: orgIdParam ?? undefined,
    dealId: dealIdParam ?? undefined,
    interactionType: (typeParam ?? undefined) as any,
    from: fromParam ?? undefined,
    to: toParam ?? undefined,
    limit,
    offset,
  });
  return NextResponse.json({ interactions });
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
  const interaction = await createInteraction(user.userId, {
    personId: d.person_id,
    organizationId: d.organization_id,
    dealId: d.deal_id,
    interactionType: d.interaction_type as any,
    summary: d.summary,
    occurredAt: d.occurred_at,
  });
  await recordAudit({
    actorId: user.userId,
    action: 'business.interaction.created',
    payload: { interactionId: interaction.id, interactionType: interaction.interactionType },
  });
  return NextResponse.json({ interaction }, { status: 201 });
}
