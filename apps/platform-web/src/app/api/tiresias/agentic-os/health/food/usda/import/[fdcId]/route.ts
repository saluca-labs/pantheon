import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  importUsdaFood,
  recordAudit,
} from '@/lib/agentic-os/health/repo';
import {
  isUsdaConfigured,
  UsdaFetchError,
  UsdaNotConfiguredError,
} from '@/lib/agentic-os/health/usda-fdc';

interface RouteCtx {
  params: Promise<{ fdcId: string }>;
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

export async function POST(_request: NextRequest, { params }: RouteCtx) {
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const { fdcId: raw } = await params;
  const fdcId = Number(raw);
  if (!Number.isFinite(fdcId) || fdcId <= 0) {
    return NextResponse.json({ error: 'Invalid fdcId' }, { status: 400 });
  }
  if (!isUsdaConfigured()) {
    return NextResponse.json(
      { error: 'usda_not_configured' },
      { status: 503 },
    );
  }
  try {
    const item = await importUsdaFood({
      tenantId: ok.user.tenantId,
      fdcId,
    });
    await recordAudit({
      actorId: ok.user.userId,
      action: 'health.food.usda.import',
      payload: { id: item.id, fdcId, name: item.name },
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    if (e instanceof UsdaNotConfiguredError) {
      return NextResponse.json(
        { error: 'usda_not_configured' },
        { status: 503 },
      );
    }
    if (e instanceof UsdaFetchError) {
      return NextResponse.json(
        { error: e.message },
        { status: e.status ?? 502 },
      );
    }
    throw e;
  }
}
