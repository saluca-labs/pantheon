import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { callLlm } from '@platform/llm';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { recordAudit } from '@/lib/agentic-os/health/repo';
import { buildCoachContext } from '@/lib/agentic-os/health/coach/context';
import { buildSystemPrompt } from '@/lib/agentic-os/health/coach/system-prompt';
import {
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/health/coach/anthropic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Recommendation = z.string().min(8).max(280);

const PlanSchema = z.object({
  activity: z.array(Recommendation).min(3).max(5),
  nutrition: z.array(Recommendation).min(3).max(5),
  sleep: z.array(Recommendation).min(3).max(5),
  mental_health: z.array(Recommendation).min(3).max(5),
});

const PLAN_INSTRUCTION = `Generate a 1-week holistic health plan for this user
covering activity, nutrition, sleep, and mental health. Output JSON with keys
"activity", "nutrition", "sleep", "mental_health" — each an array of 3-5 brief,
actionable recommendations grounded in the current snapshot.

Hard rules:
- Do NOT prescribe medication or supplements. Defer to "your doctor",
  "your prescriber", or "a registered dietitian".
- If any screener result is severity ≥ moderately_severe (PHQ-9 ≥ 15,
  GAD-7 ≥ 15, PSS-10 ≥ 27), at least one mental_health recommendation must
  encourage talking with a licensed professional.
- Phrase mental-health items as "what the screener suggests" / "what I'm
  hearing", never "you have X".
- Keep each recommendation under 280 characters and start with an action verb.`;

export async function POST(_request: NextRequest) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isCoachConfigured()) {
    return NextResponse.json(
      {
        error: 'coach_not_configured',
        message:
          'AI coach is not yet configured — admin needs to set ANTHROPIC_API_KEY.',
      },
      { status: 503 },
    );
  }

  const context = await buildCoachContext({
    tenantId: user.tenantId,
    userId: user.userId,
  });
  const systemPrompt = buildSystemPrompt(context);
  const modelId = getCoachModelId();

  let plan: z.infer<typeof PlanSchema>;
  try {
    plan = await callLlm<z.infer<typeof PlanSchema>>({
      system: systemPrompt,
      user: PLAN_INSTRUCTION,
      tenantId: user.tenantId,
      osSlug: 'health',
      provider: 'anthropic',
      model: modelId,
      jsonMode: true,
      schema: PlanSchema,
    });
  } catch (err) {
    console.error('[health.coach.plan] llm error', err);
    return NextResponse.json(
      { error: 'llm_failed', message: (err as Error).message || 'LLM call failed' },
      { status: 502 },
    );
  }

  await recordAudit({
    actorId: user.userId,
    action: 'health.coach.holistic_plan.generated',
    payload: { model: modelId },
  });

  return NextResponse.json({ plan });
}
