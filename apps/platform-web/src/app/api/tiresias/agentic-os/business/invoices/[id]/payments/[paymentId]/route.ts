/**
 * Business OS Phase 4 — single payment route.
 *
 * GET    /api/tiresias/agentic-os/business/invoices/[id]/payments/[paymentId]
 * PATCH  /api/tiresias/agentic-os/business/invoices/[id]/payments/[paymentId]
 * DELETE /api/tiresias/agentic-os/business/invoices/[id]/payments/[paymentId]
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getPayment,
  updatePayment,
  deletePayment,
} from '@/lib/agentic-os/business/payments-repo';
import { PAYMENT_METHODS } from '@/lib/agentic-os/business/payments';

const PatchBody = z.object({
  amount_cents: z.number().int().positive().optional(),
  currency: z.string().min(1).max(8).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  received_on: z.string().optional(),
  reference: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string; paymentId: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { paymentId } = await params;
  const payment = await getPayment(paymentId, user.userId);
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ payment });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { paymentId } = await params;

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const outcome = await updatePayment(paymentId, user.userId, {
    amountCents: d.amount_cents,
    currency: d.currency,
    method: d.method,
    receivedOn: d.received_on,
    reference: d.reference,
    notes: d.notes,
    metadata: d.metadata,
  });

  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.payment.updated',
    payload: { paymentId, fields: Object.keys(d) },
  });

  return NextResponse.json({ payment: outcome.payment });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { paymentId } = await params;

  const deleted = await deletePayment(paymentId, user.userId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await recordAudit({
    actorId: user.userId,
    action: 'business.payment.voided',
    payload: { paymentId },
  });

  return NextResponse.json({ ok: true });
}
