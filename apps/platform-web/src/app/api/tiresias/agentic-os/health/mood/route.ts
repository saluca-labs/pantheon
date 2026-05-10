import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  listMoodEntries,
  recordAudit,
  recordMoodEntry,
  recordRiskFlag,
} from '@/lib/agentic-os/health/repo';
import { MoodEntryBody } from '@/lib/agentic-os/health/schemas';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';

/**
 * GET  — list recent mood entries (default last 30 days, limit 50).
 *        Optional ?from=, ?to= (ISO), ?limit=, ?withTags=true.
 * POST — record a mood entry. Crisis-guard wraps the `notes` field.
 *        Mental-scope consent is required.
 */
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
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const limit = url.searchParams.get('limit');
  const withTags = url.searchParams.get('withTags') === 'true';
  const entries = await listMoodEntries(user.userId, {
    from,
    to,
    limit: limit ? Number(limit) : undefined,
    withTags,
  });
  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest) {
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
  const parsed = MoodEntryBody.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const created = await withCrisisGuard(
    parsed.data,
    {
      osSlug: 'health',
      source: 'mood-entry',
      // The `notes` field is the only free-text leg; tags are uuids.
      extractText: (b) => [b.notes],
      persistFlag: (flag) =>
        recordRiskFlag(user.userId, user.tenantId, flag).then(() => undefined),
    },
    () => recordMoodEntry(user.userId, user.tenantId, parsed.data),
  );
  await recordAudit({
    actorId: user.userId,
    action: 'health.mood.created',
    payload: {
      id: created.id,
      hasNotes: !!parsed.data.notes,
      tagCount: parsed.data.tagIds?.length ?? 0,
    },
  });
  return NextResponse.json({ entry: created }, { status: 201 });
}
