/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/bom-summary
 *
 * GET — return the computed BOM summary for one project:
 *
 *   - per-line: needed, on_hand, free, deficit, est_cost
 *   - totals:    totalEstCostCents, totalDeficit, criticalDeficitLines
 *
 * "free" subtracts demand from OTHER active projects (status not in
 * ('done','archived')) so the workshop sees true unallocated stock.
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { getBomSummary } from '@/lib/agentic-os/maker/repo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  try {
    const summary = await getBomSummary(projectId, user.userId);
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not found' },
      { status: 404 },
    );
  }
}
