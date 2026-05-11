/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/dashboard/trends
 *
 * GET — full trends payload (alerts_by_day, open_vulns_by_severity,
 * exposures_mttr_days, ioc_hits_last_7d, top_vulnerable_assets).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { getCyberTrendsData } from '@/lib/agentic-os/cyber/repo';

export async function GET(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const windowDays = Number(request.nextUrl.searchParams.get('window') ?? '30');
  const trends = await getCyberTrendsData({
    ownerId: user.userId,
    windowDays: Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 30,
  });
  return NextResponse.json({ trends });
}
