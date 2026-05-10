import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getDailyActivitySummary,
  getDailyNutritionSummary,
} from '@/lib/agentic-os/health/repo';

/**
 * GET — daily nutrition + activity summary (?date=YYYY-MM-DD; defaults to today).
 * Read-only, no audit row.
 */

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

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
  const dateParam = url.searchParams.get('date');
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayUtc();
  const [nutrition, activity] = await Promise.all([
    getDailyNutritionSummary(user.tenantId, user.userId, date),
    getDailyActivitySummary(user.tenantId, user.userId, date),
  ]);
  return NextResponse.json({ date, nutrition, activity });
}
