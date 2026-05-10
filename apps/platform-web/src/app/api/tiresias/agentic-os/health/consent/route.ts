import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { listConsents, recordAudit, setConsent } from '@/lib/agentic-os/health/repo';
import { ConsentBody } from '@/lib/agentic-os/health/schemas';

/**
 * GET — list every consent row for the current user (one per scope).
 * PUT — set consent for a scope. Latest-row-wins on (user, scope).
 */
export async function GET() {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const consents = await listConsents(user.userId, user.tenantId);
  return NextResponse.json({ consents });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = ConsentBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const row = await setConsent(
    user.userId,
    user.tenantId,
    parsed.data.scope,
    parsed.data.granted,
    parsed.data.metadata,
  );
  await recordAudit({
    actorId: user.userId,
    action: parsed.data.granted
      ? 'health.consent.granted'
      : 'health.consent.revoked',
    payload: { scope: parsed.data.scope },
  });
  return NextResponse.json({ consent: row });
}
