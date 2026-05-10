import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  createActivityEntry,
  getActiveConsent,
  listActivityEntries,
  recordAudit,
  recordRiskFlag,
} from '@/lib/agentic-os/health/repo';
import { ActivityEntryBody } from '@/lib/agentic-os/health/schemas';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';

/**
 * GET  — list activity entries (?from=&to=&limit=).
 * POST — create an activity entry. The repo auto-fills kcal_burned via the
 *        MET_TABLE estimator when not supplied. Crisis-guard runs on notes.
 */

async function ensureUserAndConsent() {
  const user = await getCurrentHealthUser();
  if (!user) {
    return {
      err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    } as const;
  }
  const consent = await getActiveConsent(user.userId, user.tenantId, 'mental');
  if (!consent || !consent.granted) {
    return {
      err: NextResponse.json(
        { error: 'Mental-health consent required' },
        { status: 403 },
      ),
    } as const;
  }
  return { user } as const;
}

export async function GET(request: NextRequest) {
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const limit = url.searchParams.get('limit');
  const entries = await listActivityEntries({
    tenantId: ok.user.tenantId,
    userId: ok.user.userId,
    fromDate: from,
    toDate: to,
    limit: limit ? Number(limit) : undefined,
  });
  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest) {
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = ActivityEntryBody.safeParse(
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
      source: 'health.activity.create',
      extractText: (b) => [b.notes],
      persistFlag: (flag) =>
        recordRiskFlag(ok.user.userId, ok.user.tenantId, flag).then(
          () => undefined,
        ),
    },
    () => createActivityEntry(ok.user.tenantId, ok.user.userId, parsed.data),
  );
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.activity.create',
    payload: {
      id: created.id,
      activityType: created.activityType,
      entryDate: created.entryDate,
    },
  });
  return NextResponse.json({ entry: created }, { status: 201 });
}
