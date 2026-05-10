import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getTrends,
  type TrendWindow,
} from '@/lib/agentic-os/health/repo';

/**
 * GET — return aggregated trend series + stats for the last 7/30/90 days.
 * Mental-scope consent is required; the endpoint is read-only and does
 * not record an audit entry (no mutation).
 */

const WindowEnum = z.enum(['7d', '30d', '90d']);

export async function GET(request: NextRequest) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const consent = await getActiveConsent(user.userId, user.tenantId, 'mental');
  if (!consent || !consent.granted) {
    return NextResponse.json(
      { error: 'Mental-health consent required' },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const rawWindow = url.searchParams.get('window') ?? '30d';
  const parsed = WindowEnum.safeParse(rawWindow);
  const window: TrendWindow = parsed.success ? parsed.data : '30d';

  const trends = await getTrends(user.userId, user.tenantId, window);
  return NextResponse.json(trends);
}
