/**
 * Research OS Phase 6 — /api/tiresias/agentic-os/research/blockers
 *
 * GET — Top Blockers feed across ALL of the caller's research experiments.
 *       Returns ``{ items, generated_at }``. Items combine:
 *
 *         - Milestones in (missed | blocked | overdue | at_risk in 7d)
 *         - Experiment dependencies with kind='blocks' AND status='open'
 *
 *       Ranked by severity (high → medium), tie-break by oldest due_at
 *       then created_at.
 *
 *       Query params:
 *         - ``limit`` — N items, default 25, max 100.
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { listTopBlockers } from '@/lib/agentic-os/research/blockers-repo';
import { clampBlockerLimit } from '@/lib/agentic-os/research/blockers';

export async function GET(request: NextRequest) {
  const user = await getCurrentResearchUser();
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
    // Clamp inside the lib for consistency with the repo path; explicit
    // ceiling so callers asking for 200 get exactly 100.
    limit = clampBlockerLimit(parsed);
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
