/**
 * Business OS Phase 5 — single expense route.
 *
 * GET    /api/tiresias/agentic-os/business/expenses/[id]
 * PATCH  /api/tiresias/agentic-os/business/expenses/[id]
 * DELETE /api/tiresias/agentic-os/business/expenses/[id]
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getExpense,
  updateExpense,
  deleteExpense,
} from '@/lib/agentic-os/business/expenses-repo';
import { EXPENSE_CATEGORIES } from '@/lib/agentic-os/business/expenses';

const PatchBody = z.object({
  project_id: z.string().uuid().nullable().optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  vendor: z.string().max(300).nullable().optional(),
  description: z.string().max(500).optional(),
  amount_cents: z.number().int().positive().optional(),
  currency: z.string().min(1).max(8).optional(),
  incurred_on: z.string().optional(),
  paid_on: z.string().nullable().optional(),
  receipt_url: z.string().nullable().optional(),
  is_reimbursable: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const expense = await getExpense(id, user.userId);
  if (!expense) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ expense });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getExpense(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const outcome = await updateExpense(id, user.userId, {
    projectId: d.project_id as any,
    category: d.category as any,
    vendor: d.vendor as any,
    description: d.description,
    amountCents: d.amount_cents,
    currency: d.currency,
    incurredOn: d.incurred_on,
    paidOn: d.paid_on as any,
    receiptUrl: d.receipt_url as any,
    isReimbursable: d.is_reimbursable,
    tags: d.tags,
    metadata: d.metadata,
  });

  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.expense.updated',
    payload: { expenseId: id, fields: Object.keys(d) },
  });

  return NextResponse.json({ expense: outcome.expense });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const outcome = await deleteExpense(id, user.userId);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.expense.deleted',
    payload: { expenseId: id },
  });

  return NextResponse.json({ ok: true });
}
