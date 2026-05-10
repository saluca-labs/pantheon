import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  searchUsdaAndCache,
} from '@/lib/agentic-os/health/repo';
import { isUsdaConfigured } from '@/lib/agentic-os/health/usda-fdc';

/**
 * GET ?q=<query>&limit= — search USDA FDC and cache hits into the local
 * food_item table. Returns 503 ``{ error: 'usda_not_configured' }`` when
 * ``USDA_FDC_API_KEY`` is unset so the UI can render an inline notice.
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
  if (!isUsdaConfigured()) {
    return NextResponse.json(
      { error: 'usda_not_configured' },
      { status: 503 },
    );
  }
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (q.length === 0) return NextResponse.json({ items: [] });
  const limit = url.searchParams.get('limit');
  const items = await searchUsdaAndCache({
    tenantId: ok.user.tenantId,
    query: q,
    limit: limit ? Number(limit) : undefined,
  });
  return NextResponse.json({ items });
}
