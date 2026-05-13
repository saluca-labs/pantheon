/**
 * Business OS Phase 4 — quotes collection route.
 *
 * GET  /api/tiresias/agentic-os/business/quotes
 * POST /api/tiresias/agentic-os/business/quotes
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { listQuotes, createQuote } from '@/lib/agentic-os/business/quotes-repo';
import { QUOTE_STATUSES } from '@/lib/agentic-os/business/quotes';

const CreateBody = z.object({
  title: z.string().min(1).max(300),
  quote_number: z.string().min(1).max(50),
  contact_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  description_md: z.string().max(50_000).optional(),
  status: z.enum(QUOTE_STATUSES).optional(),
  quote_date: z.string().optional(),
  expires_on: z.string().nullable().optional(),
  currency: z.string().min(1).max(8).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const archivedParam = url.searchParams.get('archived');
  const statusParam = url.searchParams.get('status');
  const contactIdParam = url.searchParams.get('contact_id');
  const dealIdParam = url.searchParams.get('deal_id');
  const projectIdParam = url.searchParams.get('project_id');
  const qParam = url.searchParams.get('q');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (statusParam) {
    const statuses = statusParam.split(',').map((s) => s.trim());
    for (const s of statuses) {
      if (!(QUOTE_STATUSES as readonly string[]).includes(s)) {
        return NextResponse.json(
          { error: `Invalid status: "${s}". Valid: ${QUOTE_STATUSES.join(', ')}` },
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

  const quotes = await listQuotes(user.userId, {
    archived: archivedParam === 'true',
    status: statusParam
      ? (statusParam.split(',').map((s) => s.trim()) as any)
      : undefined,
    contactId: contactIdParam ?? undefined,
    dealId: dealIdParam ?? undefined,
    projectId: projectIdParam ?? undefined,
    q: qParam ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({ quotes });
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

  const quote = await createQuote(user.userId, {
    title: d.title,
    quoteNumber: d.quote_number,
    contactId: d.contact_id ?? null,
    dealId: d.deal_id ?? null,
    projectId: d.project_id ?? null,
    descriptionMd: d.description_md,
    status: d.status,
    quoteDate: d.quote_date,
    expiresOn: d.expires_on ?? null,
    currency: d.currency,
    metadata: d.metadata,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'business.quote.created',
    payload: { quoteId: quote.id },
  });

  return NextResponse.json({ quote }, { status: 201 });
}
