/**
 * Business OS Phase 5 — P&L snapshots collection route.
 *
 * GET  /api/tiresias/agentic-os/business/pnl/snapshots
 * POST /api/tiresias/agentic-os/business/pnl/snapshots
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { listSnapshots, createSnapshot } from '@/lib/agentic-os/business/pnl-snapshots-repo';
import { PERIOD_KINDS } from '@/lib/agentic-os/business/pnl-snapshots';

const CreateBody = z.object({
  period_kind: z.enum(PERIOD_KINDS),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  revenue_cents: z.number().int(),
  expense_cents: z.number().int(),
  margin_cents: z.number().int().optional(),
  currency: z.string().min(1).max(8),
  is_locked: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const periodKindParam = url.searchParams.get('period_kind');
  const lockedParam = url.searchParams.get('locked');
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (periodKindParam && !(PERIOD_KINDS as readonly string[]).includes(periodKindParam)) {
    return NextResponse.json(
      { error: `Invalid period_kind: "${periodKindParam}". Valid: ${PERIOD_KINDS.join(', ')}` },
      { status: 400 },
    );
  }

  const limit = limitParam ? Number(limitParam) : undefined;
  const offset = offsetParam ? Number(offsetParam) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 500)) {
    return NextResponse.json({ error: 'Invalid limit (1..500)' }, { status: 400 });
  }
  if (offset !== undefined && (!Number.isFinite(offset) || offset < 0)) {
    return NextResponse.json({ error: 'Invalid offset (>= 0)' }, { status: 400 });
  }

  const snapshots = await listSnapshots(user.userId, {
    periodKind: periodKindParam as any,
    locked: lockedParam === 'true' ? true : lockedParam === 'false' ? false : undefined,
    from: fromParam ?? undefined,
    to: toParam ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({ snapshots });
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

  // Validate period range
  const start = new Date(d.period_start);
  const end = new Date(d.period_end);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json(
      { error: 'Invalid date format for period_start or period_end' },
      { status: 400 },
    );
  }
  if (start > end) {
    return NextResponse.json(
      { error: 'period_start must be before or equal to period_end' },
      { status: 400 },
    );
  }

  const outcome = await createSnapshot(user.userId, {
    periodKind: d.period_kind,
    periodStart: d.period_start,
    periodEnd: d.period_end,
    revenueCents: d.revenue_cents,
    expenseCents: d.expense_cents,
    marginCents: d.margin_cents,
    currency: d.currency,
    isLocked: d.is_locked,
    notes: d.notes ?? null,
  });

  if (outcome.kind === 'duplicate') {
    return NextResponse.json(
      {
        error: 'A snapshot for this period already exists',
        existing: outcome.existing,
      },
      { status: 409 },
    );
  }

  await recordAudit({
    actorId: user.userId,
    action: 'business.pnl.snapshot.created',
    payload: { snapshotId: outcome.snapshot.id },
  });

  return NextResponse.json({ snapshot: outcome.snapshot }, { status: 201 });
}
