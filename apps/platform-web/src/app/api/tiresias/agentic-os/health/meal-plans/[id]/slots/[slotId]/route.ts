import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  deletePlanSlot,
  getActiveConsent,
  recordAudit,
  recordRiskFlag,
  updatePlanSlot,
} from '@/lib/agentic-os/health/repo';
import { MealPlanSlotUpdateBody } from '@/lib/agentic-os/health/schemas';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';

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

export async function PATCH(request: NextRequest, { params }: RouteCtx) {
  const { id: planId, slotId } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = MealPlanSlotUpdateBody.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const updated = await withCrisisGuard(
    parsed.data,
    {
      osSlug: 'health',
      source: 'health.meal_plan.slot.update',
      extractText: (b) => [b.notes, b.freeformText],
      persistFlag: (flag) =>
        recordRiskFlag(ok.user.userId, ok.user.tenantId, flag).then(
          () => undefined,
        ),
    },
    () =>
      updatePlanSlot(slotId, ok.user.tenantId, ok.user.userId, parsed.data),
  );
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.meal_plan.slot.update',
    payload: { planId, slotId, fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ slot: updated });
}

export async function DELETE(_request: NextRequest, { params }: RouteCtx) {
  const { id: planId, slotId } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const deleted = await deletePlanSlot(
    slotId,
    ok.user.tenantId,
    ok.user.userId,
  );
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.meal_plan.slot.delete',
    payload: { planId, slotId },
  });
  return NextResponse.json({ ok: true });
}
