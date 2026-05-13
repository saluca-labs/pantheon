/**
 * Business OS Phase 4 — convert quote to invoice route.
 *
 * POST /api/tiresias/agentic-os/business/quotes/[id]/convert
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { getQuote, convertQuote } from '@/lib/agentic-os/business/quotes-repo';
import { createInvoice } from '@/lib/agentic-os/business/invoices-repo';
import { listLineItems, createLineItem } from '@/lib/agentic-os/business/line-items-repo';
import { getOrCreateSettings } from '@/lib/agentic-os/business/settings-repo';

const ConvertBody = z.object({
  invoice_number: z.string().min(1).max(50).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const quote = await getQuote(id, user.userId);
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (quote.status !== 'sent' && quote.status !== 'accepted') {
    return NextResponse.json(
      { error: `Quote status is "${quote.status}". Must be sent or accepted to convert.` },
      { status: 400 },
    );
  }

  const parsed = ConvertBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Derive invoice number: explicit > settings prefix + quote number
  let invoiceNumber = parsed.data.invoice_number;
  if (!invoiceNumber) {
    const { settings } = await getOrCreateSettings(user.userId);
    invoiceNumber = `${settings.invoiceNumberPrefix}-${quote.quoteNumber}`;
  }

  // Create invoice with copied fields from quote
  const invoice = await createInvoice(user.userId, {
    title: quote.title,
    invoiceNumber,
    contactId: quote.contactId,
    dealId: quote.dealId,
    projectId: quote.projectId,
    quoteId: quote.id,
    descriptionMd: quote.descriptionMd,
    status: 'draft',
    currency: quote.currency,
  });

  // Copy line items from quote to invoice
  const lineItems = await listLineItems('quote', quote.id, user.userId);
  for (const li of lineItems) {
    await createLineItem('invoice', invoice.id, user.userId, {
      description: li.description,
      quantity: li.quantity,
      unitLabel: li.unitLabel,
      unitPriceCents: li.unitPriceCents,
      taxRateBp: li.taxRateBp,
      position: li.position,
      metadata: li.metadata,
    });
  }

  // Convert the quote (marks as converted, links to invoice)
  const updatedQuote = await convertQuote(id, user.userId, invoice.id);
  if (!updatedQuote) {
    return NextResponse.json({ error: 'Failed to convert quote' }, { status: 500 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.quote.converted',
    payload: { quoteId: id, invoiceId: invoice.id },
  });

  await recordAudit({
    actorId: user.userId,
    action: 'business.invoice.created',
    payload: { invoiceId: invoice.id, convertedFromQuoteId: id },
  });

  return NextResponse.json({ quote: updatedQuote, invoice }, { status: 201 });
}
