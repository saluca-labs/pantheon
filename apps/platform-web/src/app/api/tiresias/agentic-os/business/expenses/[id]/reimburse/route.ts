/**
 * Business OS Phase 5 — mark expense as reimbursed.
 *
 * POST /api/tiresias/agentic-os/business/expenses/[id]/reimburse
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { markReimbursed } from '@/lib/agentic-os/business/expenses-repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const expense = await markReimbursed(id, user.userId);
  if (!expense) {
    return NextResponse.json(
      { error: 'Not found or not reimbursable' },
      { status: 404 },
    );
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.expense.reimbursed',
    payload: { expenseId: id },
  });

  return NextResponse.json({ expense });
}
