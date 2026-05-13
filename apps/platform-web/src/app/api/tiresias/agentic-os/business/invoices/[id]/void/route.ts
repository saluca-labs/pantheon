/**
 * Business OS Phase 4 — void invoice route.
 *
 * POST /api/tiresias/agentic-os/business/invoices/[id]/void
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { voidInvoice } from '@/lib/agentic-os/business/invoices-repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const outcome = await voidInvoice(id, user.userId);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.kind === 'invalid_transition') {
    return NextResponse.json({ error: outcome.reason }, { status: 400 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.invoice.voided',
    payload: { invoiceId: id },
  });

  return NextResponse.json({ invoice: outcome.invoice });
}
