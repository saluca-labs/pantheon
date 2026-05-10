import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  createRecipe,
  getActiveConsent,
  listRecipes,
  recordAudit,
  recordRiskFlag,
} from '@/lib/agentic-os/health/repo';
import { RecipeBody } from '@/lib/agentic-os/health/schemas';
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

export async function GET(request: NextRequest) {
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? undefined;
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');
  const recipes = await listRecipes({
    tenantId: ok.user.tenantId,
    userId: ok.user.userId,
    q,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return NextResponse.json({ recipes });
}

export async function POST(request: NextRequest) {
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = RecipeBody.safeParse(await request.json().catch(() => null));
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
      source: 'health.recipe.create',
      extractText: (b) => [b.description, b.instructions],
      persistFlag: (flag) =>
        recordRiskFlag(ok.user.userId, ok.user.tenantId, flag).then(
          () => undefined,
        ),
    },
    () => createRecipe(ok.user.tenantId, ok.user.userId, parsed.data),
  );
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.recipe.create',
    payload: { id: created.id, name: created.name },
  });
  return NextResponse.json({ recipe: created }, { status: 201 });
}
