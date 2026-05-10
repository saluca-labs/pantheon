import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  createMealPlan,
  getActiveConsent,
  getMealPlanForWeek,
  listMealPlans,
  MealPlanValidationError,
  recordAudit,
  recordRiskFlag,
} from '@/lib/agentic-os/health/repo';
import { MealPlanBody } from '@/lib/agentic-os/health/schemas';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';

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

/**
 * GET:
 *   - ``?week=YYYY-MM-DD`` — returns the single plan for that week, with all
 *     slots + recipe/food joins. Returns ``{ plan: null }`` if no plan.
 *   - otherwise: list plans (``?from=``, ``?to=``, ``?limit=``).
 */
export async function GET(request: NextRequest) {
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const url = new URL(request.url);
  const week = url.searchParams.get('week');
  if (week) {
    const plan = await getMealPlanForWeek(
      ok.user.tenantId,
      ok.user.userId,
      week,
    );
    return NextResponse.json({ plan });
  }
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const limit = url.searchParams.get('limit');
  const plans = await listMealPlans({
    tenantId: ok.user.tenantId,
    userId: ok.user.userId,
    fromWeek: from,
    toWeek: to,
    limit: limit ? Number(limit) : undefined,
  });
  return NextResponse.json({ plans });
}

export async function POST(request: NextRequest) {
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = MealPlanBody.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const created = await withCrisisGuard(
      parsed.data,
      {
        osSlug: 'health',
        source: 'health.meal_plan.create',
        extractText: (b) => [b.notes],
        persistFlag: (flag) =>
          recordRiskFlag(ok.user.userId, ok.user.tenantId, flag).then(
            () => undefined,
          ),
      },
      () => createMealPlan(ok.user.tenantId, ok.user.userId, parsed.data),
    );
    await recordAudit({
      actorId: ok.user.userId,
      action: 'health.meal_plan.create',
      payload: { id: created.id, weekStartDate: created.weekStartDate },
    });
    return NextResponse.json({ plan: created }, { status: 201 });
  } catch (e) {
    if (e instanceof MealPlanValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
