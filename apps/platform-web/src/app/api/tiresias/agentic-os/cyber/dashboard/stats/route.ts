/**
 * CyberSec OS — /api/tiresias/agentic-os/cyber/dashboard/stats
 *
 * GET — rolled-up counts powering the Cyber OS hub stats row.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { NextResponse } from 'next/server';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { getCyberDashboardStats } from '@/lib/agentic-os/cyber/repo';

export async function GET() {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const stats = await getCyberDashboardStats(user.userId);
  return NextResponse.json({ stats });
}
