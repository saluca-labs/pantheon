/**
 * Maker OS — /api/tiresias/agentic-os/maker/recent-activity
 *
 * GET — return the top-N most recent build-log entries across ALL of the
 *       current user's Maker projects, joined to project name for display.
 *       Default limit 5; max 25. Powers the Recent activity widget on the
 *       Maker hub.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { listRecentLogEntries } from '@/lib/agentic-os/maker/repo';

export async function GET(request: NextRequest) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limitParam = request.nextUrl.searchParams.get('limit');
  const parsed = limitParam ? Number.parseInt(limitParam, 10) : 5;
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 5;

  const entries = await listRecentLogEntries(user.userId, limit);
  return NextResponse.json({ entries });
}
