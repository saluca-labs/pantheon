import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  addActivityPlanSlot,
  getActiveConsent,
  recordAudit,
  recordRiskFlag,
} from '@/lib/agentic-os/health/repo';
import { ActivityPlanSlotBody } from '@/lib/agentic-os/health/schemas';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';

interface RouteCtx {
  params: Promise<{ id: string }>;
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
  const { id: planId } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = ActivityPlanSlotBody.safeParse(
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
      source: 'health.activity_plan.slot.create',
      extractText: (b) => [b.notes, b.freeformText],
      persistFlag: (flag) =>
        recordRiskFlag(ok.user.userId, ok.user.tenantId, flag).then(
          () => undefined,
        ),
    },
    () =>
      addActivityPlanSlot(
        planId,
        ok.user.tenantId,
        ok.user.userId,
        parsed.data,
      ),
  );
  if (!created) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.activity_plan.slot.create',
    payload: { planId, slotId: created.id, dayOfWeek: created.dayOfWeek },
  });
  return NextResponse.json({ slot: created }, { status: 201 });
}
