/**
 * Business OS Phase 4 — rollup unbilled time entries into invoice line items.
 *
 * POST /api/tiresias/agentic-os/business/invoices/[id]/from-time-entries
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { getInvoice, updateInvoiceTotals } from '@/lib/agentic-os/business/invoices-repo';
import { listTimeEntries, markBilled } from '@/lib/agentic-os/business/time-entries-repo';
import { listTasks } from '@/lib/agentic-os/business/tasks-repo';
import { createLineItem } from '@/lib/agentic-os/business/line-items-repo';
import type { LineItem } from '@/lib/agentic-os/business/line-items';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const invoice = await getInvoice(id, user.userId);
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!invoice.projectId) {
    return NextResponse.json(
      { error: 'Invoice is not linked to a project. Link a project first.' },
      { status: 400 },
    );
  }

  // Get unbilled time entries for this project
  const entries = await listTimeEntries(user.userId, {
    projectId: invoice.projectId,
    unbilled: true,
    isBillable: true,
    limit: 500,
  });

  if (entries.length === 0) {
    return NextResponse.json({ line_items: [], message: 'No unbilled time entries found.' });
  }

  // Fetch tasks to get billing rates
  const tasks = await listTasks(user.userId, {
    projectId: invoice.projectId,
    limit: 500,
  });
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // Group entries by task_id
  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = groups.get(entry.taskId) ?? [];
    list.push(entry);
    groups.set(entry.taskId, list);
  }

  const createdItems: LineItem[] = [];
  const billedEntryIds: string[] = [];

  for (const [taskId, group] of groups) {
    const task = taskMap.get(taskId);
    const totalMinutes = group.reduce(
      (sum, e) => sum + (e.durationMinutes ?? 0),
      0,
    );
    const hours = totalMinutes / 60;

    const rate = task?.billingRateCents ?? 0;

    const item = await createLineItem('invoice', id, user.userId, {
      description: task?.title ?? `Time entries for task ${taskId}`,
      quantity: Math.round(hours * 100) / 100,
      unitLabel: 'hour',
      unitPriceCents: rate,
      timeEntryIds: group.map((e) => e.id),
    });

    for (const entry of group) {
      await markBilled(entry.id, user.userId, id);
      billedEntryIds.push(entry.id);
    }

    createdItems.push(item);
  }

  // Reconcile totals
  await updateInvoiceTotals(id, user.userId);

  await recordAudit({
    actorId: user.userId,
    action: 'business.time_entries.billed',
    payload: {
      invoiceId: id,
      count: billedEntryIds.length,
      entryIds: billedEntryIds,
    },
  });

  return NextResponse.json({ line_items: createdItems }, { status: 201 });
}
