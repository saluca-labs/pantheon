import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  computeRecipeNutrition,
  getActiveConsent,
  getRecipe,
} from '@/lib/agentic-os/health/repo';

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
  // Ownership check first so we don't leak nutrition for someone else's recipe.
  const recipe = await getRecipe(id, ok.user.tenantId);
  if (!recipe || recipe.userId !== ok.user.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const nutrition = await computeRecipeNutrition(id, ok.user.tenantId);
  return NextResponse.json({ nutrition });
}
