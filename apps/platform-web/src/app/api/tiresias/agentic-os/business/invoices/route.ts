/**
 * Business OS Phase 4 — invoices collection route.
 *
 * GET  /api/tiresias/agentic-os/business/invoices
 * POST /api/tiresias/agentic-os/business/invoices
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { listInvoices, createInvoice } from '@/lib/agentic-os/business/invoices-repo';
import { INVOICE_STATUSES, type InvoiceStatus } from '@/lib/agentic-os/business/invoices';

const CreateBody = z.object({
  title: z.string().min(1).max(300),
  invoice_number: z.string().min(1).max(50),
  contact_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  quote_id: z.string().uuid().nullable().optional(),
  description_md: z.string().max(50_000).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  invoice_date: z.string().optional(),
  due_on: z.string().optional(),
  terms: z.string().max(50).optional(),
  currency: z.string().min(1).max(8).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const contactIdParam = url.searchParams.get('contact_id');
  const projectIdParam = url.searchParams.get('project_id');
  const dealIdParam = url.searchParams.get('deal_id');
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const outstandingParam = url.searchParams.get('outstanding');
  const qParam = url.searchParams.get('q');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (statusParam) {
    const statuses = statusParam.split(',').map((s) => s.trim());
    for (const s of statuses) {
      if (!(INVOICE_STATUSES as readonly string[]).includes(s)) {
        return NextResponse.json(
          { error: `Invalid status: "${s}". Valid: ${INVOICE_STATUSES.join(', ')}` },
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

  const invoices = await listInvoices(user.userId, {
    status: statusParam
      ? (statusParam.split(',').map((s) => s.trim()) as InvoiceStatus[])
      : undefined,
    contactId: contactIdParam ?? undefined,
    projectId: projectIdParam ?? undefined,
    dealId: dealIdParam ?? undefined,
    from: fromParam ?? undefined,
    to: toParam ?? undefined,
    outstanding: outstandingParam === 'true',
    q: qParam ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({ invoices });
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

  const invoice = await createInvoice(user.userId, {
    title: d.title,
    invoiceNumber: d.invoice_number,
    contactId: d.contact_id ?? null,
    dealId: d.deal_id ?? null,
    projectId: d.project_id ?? null,
    quoteId: d.quote_id ?? null,
    descriptionMd: d.description_md,
    status: d.status,
    invoiceDate: d.invoice_date,
    dueOn: d.due_on,
    terms: d.terms,
    currency: d.currency,
    metadata: d.metadata,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'business.invoice.created',
    payload: { invoiceId: invoice.id },
  });

  return NextResponse.json({ invoice }, { status: 201 });
}
