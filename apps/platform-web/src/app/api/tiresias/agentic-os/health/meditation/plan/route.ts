import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  generateMeditationPlan,
  getActiveConsent,
  getCurrentMeditationPlan,
  isoMondayWeekStart,
  recordAudit,
  recordMeditationPlan,
} from '@/lib/agentic-os/health/repo';
import { MeditationPlanBody } from '@/lib/agentic-os/health/schemas';

/**
 * GET  — fetch the current (most recent) meditation plan, or null if none.
 * POST — generate + persist a new weekly plan, returning the plan object.
 *
 * Mental-scope consent required. Generation is rules-based (no LLM in
 * Phase 3) — see ADR-010.
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

export async function GET(_request: NextRequest) {
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const plan = await getCurrentMeditationPlan(ok.user.userId);
  return NextResponse.json({ plan });
}

export async function POST(request: NextRequest) {
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = MeditationPlanBody.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const slots = await generateMeditationPlan(
    ok.user.userId,
    ok.user.tenantId,
    {
      goal: parsed.data.goal,
      weeklyMinutes: parsed.data.weeklyMinutes,
    },
  );
  const weekStart = isoMondayWeekStart();
  const saved = await recordMeditationPlan(
    ok.user.userId,
    ok.user.tenantId,
    weekStart,
    slots,
  );
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.meditation.plan.generated',
    payload: {
      weekStart,
      goal: parsed.data.goal ?? 'auto',
      slotCount: slots.length,
    },
  });
  return NextResponse.json({ plan: saved }, { status: 201 });
}
