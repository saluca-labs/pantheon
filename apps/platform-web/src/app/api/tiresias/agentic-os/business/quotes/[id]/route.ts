/**
 * Business OS Phase 4 — single quote route.
 *
 * GET    /api/tiresias/agentic-os/business/quotes/[id]
 * PATCH  /api/tiresias/agentic-os/business/quotes/[id]
 * DELETE /api/tiresias/agentic-os/business/quotes/[id]
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getQuote,
  updateQuote,
  deleteQuote,
  archiveQuote,
} from '@/lib/agentic-os/business/quotes-repo';
import { QUOTE_STATUSES } from '@/lib/agentic-os/business/quotes';

const PatchBody = z.object({
  title: z.string().min(1).max(300).optional(),
  quote_number: z.string().min(1).max(50).optional(),
  contact_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  description_md: z.string().max(50_000).optional(),
  status: z.enum(QUOTE_STATUSES).optional(),
  quote_date: z.string().optional(),
  expires_on: z.string().nullable().optional(),
  currency: z.string().min(1).max(8).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  archived: z.boolean().optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const quote = await getQuote(id, user.userId);
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ quote });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getQuote(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // Handle archive flag
  if (d.archived === true) {
    const archived = await archiveQuote(id, user.userId);
    if (!archived) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'business.quote.archived',
      payload: { quoteId: id },
    });
    return NextResponse.json({ quote: archived });
  }

  const { archived: _drop, ...rest } = d;
  const outcome = await updateQuote(id, user.userId, {
    title: rest.title,
    quoteNumber: rest.quote_number,
    contactId: rest.contact_id,
    dealId: rest.deal_id,
    projectId: rest.project_id,
    descriptionMd: rest.description_md,
    status: rest.status,
    quoteDate: rest.quote_date,
    expiresOn: rest.expires_on,
    currency: rest.currency,
    metadata: rest.metadata,
  });

  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.quote.updated',
    payload: { quoteId: id, fields: Object.keys(rest) },
  });

  return NextResponse.json({ quote: outcome.quote });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const outcome = await deleteQuote(id, user.userId);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.kind === 'not_draft') {
    return NextResponse.json({ error: outcome.reason }, { status: 400 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.quote.deleted',
    payload: { quoteId: id },
  });

  return NextResponse.json({ ok: true });
}
