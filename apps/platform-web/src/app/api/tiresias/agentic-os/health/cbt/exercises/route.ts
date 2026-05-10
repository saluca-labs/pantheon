import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { listCbtExercises } from '@/lib/agentic-os/health/repo';

/**
 * GET — public-within-auth catalog list. No consent gate — exercises
 * are static informational content (the same on every install). Mood
 * journaling, screeners, etc. are gated; the list of exercise *names*
 * is not.
 */
export async function GET(_request: NextRequest) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const exercises = await listCbtExercises();
  return NextResponse.json({ exercises });
}
