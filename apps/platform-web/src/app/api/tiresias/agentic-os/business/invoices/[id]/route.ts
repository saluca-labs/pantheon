/**
 * Business OS Phase 4 — single invoice route.
 *
 * GET    /api/tiresias/agentic-os/business/invoices/[id]
 * PATCH  /api/tiresias/agentic-os/business/invoices/[id]
 * DELETE /api/tiresias/agentic-os/business/invoices/[id]
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getInvoice,
  updateInvoice,
  deleteInvoice,
} from '@/lib/agentic-os/business/invoices-repo';
import { INVOICE_STATUSES } from '@/lib/agentic-os/business/invoices';

const PatchBody = z.object({
  title: z.string().min(1).max(300).optional(),
  invoice_number: z.string().min(1).max(50).optional(),
  contact_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  description_md: z.string().max(50_000).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  invoice_date: z.string().optional(),
  due_on: z.string().optional(),
  terms: z.string().max(50).optional(),
  currency: z.string().min(1).max(8).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const invoice = await getInvoice(id, user.userId);
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ invoice });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getInvoice(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const outcome = await updateInvoice(id, user.userId, {
    title: d.title,
    invoiceNumber: d.invoice_number,
    contactId: d.contact_id,
    dealId: d.deal_id,
    projectId: d.project_id,
    descriptionMd: d.description_md,
    invoiceDate: d.invoice_date,
    dueOn: d.due_on,
    terms: d.terms,
    currency: d.currency,
    metadata: d.metadata,
  });

  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.invoice.updated',
    payload: { invoiceId: id, fields: Object.keys(d) },
  });

  return NextResponse.json({ invoice: outcome.invoice });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const outcome = await deleteInvoice(id, user.userId);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.kind === 'not_draft') {
    return NextResponse.json({ error: outcome.reason }, { status: 400 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.invoice.deleted',
    payload: { invoiceId: id },
  });

  return NextResponse.json({ ok: true });
}
