import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  deleteMealEntry,
  getActiveConsent,
  getMealEntry,
  recordAudit,
  recordRiskFlag,
  updateMealEntry,
} from '@/lib/agentic-os/health/repo';
import { MealEntryUpdateBody } from '@/lib/agentic-os/health/schemas';
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

export async function GET(_request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const entry = await getMealEntry(id, ok.user.tenantId, ok.user.userId);
  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ entry });
}

export async function PATCH(request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = MealEntryUpdateBody.safeParse(
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
      source: 'health.meal.update',
      extractText: (b) => [b.freeformDescription, b.notes],
      persistFlag: (flag) =>
        recordRiskFlag(ok.user.userId, ok.user.tenantId, flag).then(
          () => undefined,
        ),
    },
    () => updateMealEntry(id, ok.user.tenantId, ok.user.userId, parsed.data),
  );
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.meal.update',
    payload: { id, fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ entry: updated });
}

export async function DELETE(_request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const deleted = await deleteMealEntry(id, ok.user.tenantId, ok.user.userId);
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.meal.delete',
    payload: { id },
  });
  return NextResponse.json({ ok: true });
}
