import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getMentalProfile,
  getProfile,
  recordAudit,
  recordRiskFlags,
  upsertMentalProfile,
} from '@/lib/agentic-os/health/repo';
import { MentalProfileBody } from '@/lib/agentic-os/health/schemas';
import { evaluateOnIntake } from '@/lib/agentic-os/health/risk-flags';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';
import { recordRiskFlag } from '@/lib/agentic-os/health/repo';

/**
 * GET — current user's mental-health profile (or null).
 * PUT — upsert; runs evaluateOnIntake and persists any flags.
 *
 * Free-text fields (`medNotes`, goal strings) are passed through the
 * shared crisis-guard for non-blocking risk-flag emission.
 */
export async function GET() {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const profile = await getMentalProfile(user.userId, user.tenantId);
  return NextResponse.json({ profile });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Mental-scope consent is a hard gate for any mental-health write.
  const consent = await getActiveConsent(user.userId, user.tenantId, 'mental');
  if (!consent || !consent.granted) {
    return NextResponse.json(
      { error: 'Mental-health consent required' },
      { status: 403 },
    );
  }

  const parsed = MentalProfileBody.safeParse(
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
      source: 'mh-profile',
      extractText: (b) => [b.medNotes, ...(b.goals ?? [])],
      persistFlag: (flag) =>
        recordRiskFlag(user.userId, user.tenantId, flag).then(() => undefined),
    },
    async () => {
      const mh = await upsertMentalProfile(user.userId, user.tenantId, parsed.data);
      const physical = await getProfile(user.userId);
      const flags = evaluateOnIntake(physical, mh, { source: 'mh-profile' });
      if (flags.length > 0) {
        await recordRiskFlags(user.userId, user.tenantId, flags);
      }
      return { profile: mh, flags: flags.length };
    },
  );

  await recordAudit({
    actorId: user.userId,
    action: 'health.mh_profile.upserted',
    payload: { fields: Object.keys(parsed.data), flags: updated.flags },
  });

  return NextResponse.json({ profile: updated.profile, flagsCreated: updated.flags });
}
