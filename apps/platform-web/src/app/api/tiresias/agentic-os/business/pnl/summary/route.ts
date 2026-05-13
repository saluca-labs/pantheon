/**
 * Business OS Phase 5 — P&L summary route.
 *
 * GET /api/tiresias/agentic-os/business/pnl/summary
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { computePnlSummary } from '@/lib/agentic-os/business/pnl-snapshots-repo';
import type { PnlGroupBy } from '@/lib/agentic-os/business/pnl-snapshots-repo';

const VALID_GROUP_BY = new Set(['month', 'project', 'category']);

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const periodStart = url.searchParams.get('period_start');
  const periodEnd = url.searchParams.get('period_end');
  const groupByParam = url.searchParams.get('group_by');

  if (!periodStart || !periodEnd) {
    return NextResponse.json(
      { error: 'period_start and period_end are required' },
      { status: 400 },
    );
  }

  // Validate dates
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
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

  let groupBy: PnlGroupBy | undefined;
  if (groupByParam) {
    if (!VALID_GROUP_BY.has(groupByParam)) {
      return NextResponse.json(
        { error: `Invalid group_by: "${groupByParam}". Valid: month, project, category` },
        { status: 400 },
      );
    }
    groupBy = groupByParam as PnlGroupBy;
  }

  const result = await computePnlSummary(user.userId, periodStart, periodEnd, groupBy);

  return NextResponse.json(result);
}
