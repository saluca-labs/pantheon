/**
 * Maker OS — /api/tiresias/agentic-os/maker/blockers
 *
 * GET — Top Blockers feed across ALL of the caller's Maker projects.
 *       Returns ``{ items, generated_at }``. Items combine:
 *
 *         - Milestones in (missed | blocked | overdue | at_risk in 7d)
 *         - Project dependencies with kind='blocks' AND status='open'
 *
 *       Ranked by severity (missed > blocked > overdue > at_risk >
 *       open_dependency), tie-break by oldest due_at then created_at.
 *
 *       Query params:
 *         - ``limit``  — N items, default 25, max 100.
 *
 * @license MIT — Tiresias Maker OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { listTopBlockers } from '@/lib/agentic-os/maker/repo';

export async function GET(request: NextRequest) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get('limit');
  let limit = 25;
  if (limitRaw !== null) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return NextResponse.json(
        { error: 'limit must be a positive integer <= 100' },
        { status: 400 },
      );
    }
    limit = Math.min(parsed, 100);
  }

  try {
    const items = await listTopBlockers(user.userId, { limit });
    return NextResponse.json({
      items,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}
