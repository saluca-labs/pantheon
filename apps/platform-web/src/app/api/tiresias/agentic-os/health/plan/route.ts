import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { getProfile, hasActiveCrisisFlag, recordAudit } from '@/lib/agentic-os/health/repo';
import { generatePlan } from '@/lib/agentic-os/health/plan-generator';
import { detectCrisisLanguage } from '@/lib/agentic-os/health/crisis-detection';
import { CRISIS_RESOURCES } from '@/lib/agentic-os/health/screeners';

const PlanBody = z.object({
  freeText: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = PlanBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // ── Crisis-safety wall ────────────────────────────────────────────────
  // Two intercept paths:
  //   1. Free-text input contains crisis language → block + show resources
  //   2. User has a recent screener result with crisis_flag = TRUE → block
  const fromText = detectCrisisLanguage(parsed.data.freeText ?? '');
  const fromScreener = await hasActiveCrisisFlag(user.userId);
  if (fromText.triggered || fromScreener) {
    await recordAudit({
      actorId: user.userId,
      action: 'health.plan.blocked.crisis',
      payload: {
        reason: fromText.triggered ? 'free_text' : 'recent_screener',
        matched: fromText.matched,
      },
    });
    return NextResponse.json(
      {
        blocked: true,
        reason: 'crisis_safety_wall',
        message:
          'Plan generation is paused. We want to make sure you have direct access to support right now. Please use one of the resources below — they are free, confidential, and available 24/7.',
        resources: CRISIS_RESOURCES,
      },
      { status: 200 },
    );
  }

  const profile = await getProfile(user.userId);
  const plan = generatePlan(profile);
  await recordAudit({
    actorId: user.userId,
    action: 'health.plan.generated',
    payload: {
      hasProfile: profile !== null,
      recCount: plan.recommendations.length,
    },
  });
  return NextResponse.json({ plan });
}
