import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  addRecipeIngredient,
  getActiveConsent,
  recordAudit,
  recordRiskFlag,
  reorderRecipeIngredients,
} from '@/lib/agentic-os/health/repo';
import {
  RecipeIngredientBody,
  RecipeIngredientReorderBody,
} from '@/lib/agentic-os/health/schemas';
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
  const { id: recipeId } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = RecipeIngredientBody.safeParse(
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
      source: 'health.recipe.ingredient.create',
      extractText: (b) => [b.notes, b.freeformName],
      persistFlag: (flag) =>
        recordRiskFlag(ok.user.userId, ok.user.tenantId, flag).then(
          () => undefined,
        ),
    },
    () =>
      addRecipeIngredient(
        recipeId,
        ok.user.tenantId,
        ok.user.userId,
        parsed.data,
      ),
  );
  if (!created) {
    return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.recipe.ingredient.create',
    payload: { recipeId, ingredientId: created.id },
  });
  return NextResponse.json({ ingredient: created }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: RouteCtx) {
  const { id: recipeId } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = RecipeIngredientReorderBody.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const ok2 = await reorderRecipeIngredients(
    recipeId,
    ok.user.tenantId,
    ok.user.userId,
    parsed.data.orderedIds,
  );
  if (!ok2) {
    return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.recipe.ingredient.reorder',
    payload: { recipeId, count: parsed.data.orderedIds.length },
  });
  return NextResponse.json({ ok: true });
}
