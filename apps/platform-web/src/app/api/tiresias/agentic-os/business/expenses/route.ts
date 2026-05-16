/**
 * Business OS Phase 5 — expenses collection route.
 *
 * GET  /api/tiresias/agentic-os/business/expenses
 * POST /api/tiresias/agentic-os/business/expenses
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { listExpenses, createExpense } from '@/lib/agentic-os/business/expenses-repo';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/agentic-os/business/expenses';

const CreateBody = z.object({
  project_id: z.string().uuid().nullable().optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  vendor: z.string().max(300).nullable().optional(),
  description: z.string().max(500).optional(),
  amount_cents: z.number().int().positive(),
  currency: z.string().min(1).max(8).optional(),
  incurred_on: z.string().min(1),
  paid_on: z.string().nullable().optional(),
  receipt_url: z.string().nullable().optional(),
  is_reimbursable: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const categoryParam = url.searchParams.get('category');
  const projectIdParam = url.searchParams.get('project_id');
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const tagParam = url.searchParams.get('tag');
  const reimbursableParam = url.searchParams.get('reimbursable');
  const qParam = url.searchParams.get('q');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (categoryParam) {
    const cats = categoryParam.split(',').map((c) => c.trim());
    for (const c of cats) {
      if (!(EXPENSE_CATEGORIES as readonly string[]).includes(c)) {
        return NextResponse.json(
          { error: `Invalid category: "${c}". Valid: ${EXPENSE_CATEGORIES.join(', ')}` },
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

  const expenses = await listExpenses(user.userId, {
    category: categoryParam
      ? (categoryParam.split(',').map((c) => c.trim()) as ExpenseCategory[])
      : undefined,
    projectId: projectIdParam ?? undefined,
    from: fromParam ?? undefined,
    to: toParam ?? undefined,
    tag: tagParam ?? undefined,
    reimbursable: reimbursableParam === 'true' ? true : undefined,
    q: qParam ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({ expenses });
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

  const expense = await createExpense(user.userId, {
    projectId: d.project_id ?? null,
    category: d.category as ExpenseCategory,
    vendor: d.vendor ?? null,
    description: d.description,
    amountCents: d.amount_cents,
    currency: d.currency,
    incurredOn: d.incurred_on,
    paidOn: d.paid_on ?? null,
    receiptUrl: d.receipt_url ?? null,
    isReimbursable: d.is_reimbursable,
    tags: d.tags,
    metadata: d.metadata,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'business.expense.created',
    payload: { expenseId: expense.id },
  });

  return NextResponse.json({ expense }, { status: 201 });
}
