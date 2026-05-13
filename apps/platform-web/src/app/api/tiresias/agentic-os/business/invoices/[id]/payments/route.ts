/**
 * Business OS Phase 4 — invoice payments collection route.
 *
 * GET  /api/tiresias/agentic-os/business/invoices/[id]/payments
 * POST /api/tiresias/agentic-os/business/invoices/[id]/payments
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { listPayments, createPayment } from '@/lib/agentic-os/business/payments-repo';
import { PAYMENT_METHODS } from '@/lib/agentic-os/business/payments';

const CreateBody = z.object({
  amount_cents: z.number().int().positive(),
  currency: z.string().min(1).max(8).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  received_on: z.string().optional(),
  reference: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const payments = await listPayments(user.userId, { invoiceId: id });
  return NextResponse.json({ payments });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const payment = await createPayment(user.userId, {
    invoiceId: id,
    amountCents: d.amount_cents,
    currency: d.currency,
    method: d.method,
    receivedOn: d.received_on,
    reference: d.reference ?? null,
    notes: d.notes ?? null,
    metadata: d.metadata,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'business.payment.recorded',
    payload: { paymentId: payment.id, invoiceId: id, amountCents: d.amount_cents },
  });

  return NextResponse.json({ payment }, { status: 201 });
}
