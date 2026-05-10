import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  deleteFoodItem,
  getActiveConsent,
  getFoodItem,
  recordAudit,
  updateFoodItem,
} from '@/lib/agentic-os/health/repo';
import { FoodItemUpdateBody } from '@/lib/agentic-os/health/schemas';

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
  const item = await getFoodItem(id, ok.user.tenantId);
  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ item });
}

export async function PATCH(request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = FoodItemUpdateBody.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const updated = await updateFoodItem(
    id,
    ok.user.tenantId,
    ok.user.userId,
    parsed.data,
  );
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.food.update',
    payload: { id, fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ item: updated });
}

export async function DELETE(_request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const deleted = await deleteFoodItem(id, ok.user.tenantId, ok.user.userId);
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.food.delete',
    payload: { id },
  });
  return NextResponse.json({ ok: true });
}
