import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  addActivityPlanSlotToActivityLog,
  getActiveConsent,
  recordAudit,
} from '@/lib/agentic-os/health/repo';

interface RouteCtx {
  params: Promise<{ id: string; slotId: string }>;
}

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

export async function POST(request: NextRequest, { params }: RouteCtx) {
  const { id: planId, slotId } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : new Date().toISOString().slice(0, 10);
  const entry = await addActivityPlanSlotToActivityLog(
    slotId,
    ok.user.tenantId,
    ok.user.userId,
    date,
  );
  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.activity_plan.slot.log',
    payload: { planId, slotId, activityEntryId: entry.id, date },
  });
  return NextResponse.json({ entry }, { status: 201 });
}
