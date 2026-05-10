import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getActivitySuggestionInputs,
} from '@/lib/agentic-os/health/repo';
import { suggestActivityIntensity } from '@/lib/agentic-os/health/activity-suggestions';

export async function GET(_request: NextRequest) {
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
  const inputs = await getActivitySuggestionInputs(user.userId);
  const suggestion = suggestActivityIntensity(inputs);
  return NextResponse.json({ ...suggestion, inputs });
}
