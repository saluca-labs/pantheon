import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  createFoodItem,
  getActiveConsent,
  recordAudit,
  searchFoodItems,
} from '@/lib/agentic-os/health/repo';
import { FoodItemBody } from '@/lib/agentic-os/health/schemas';

/**
 * GET  — search the food catalog (?q=, ?limit=). Returns user-custom rows
 *        and any USDA-cached rows (5b) visible to the tenant.
 * POST — create a custom food item.
 *
 * Mental-scope consent is required (matches the rest of Health OS). Food
 * data is tightly tied to nutrition logging which feeds into the mental
 * picture as well.
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
  const query = url.searchParams.get('q') ?? undefined;
  const limit = url.searchParams.get('limit');
  const items = await searchFoodItems({
    tenantId: ok.user.tenantId,
    userId: ok.user.userId,
    query,
    limit: limit ? Number(limit) : undefined,
  });
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = FoodItemBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const created = await createFoodItem(ok.user.tenantId, ok.user.userId, parsed.data);
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.food.create',
    payload: { id: created.id, name: created.name },
  });
  return NextResponse.json({ item: created }, { status: 201 });
}
