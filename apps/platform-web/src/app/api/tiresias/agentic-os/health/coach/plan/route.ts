import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateObject } from 'ai';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { recordAudit } from '@/lib/agentic-os/health/repo';
import { buildCoachContext } from '@/lib/agentic-os/health/coach/context';
import { buildSystemPrompt } from '@/lib/agentic-os/health/coach/system-prompt';
import {
  getAnthropicProvider,
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
  const provider = getAnthropicProvider();
  const modelId = getCoachModelId();

  const result = await generateObject({
    model: provider(modelId),
    schema: PlanSchema,
    system: systemPrompt,
    prompt: PLAN_INSTRUCTION,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'health.coach.holistic_plan.generated',
    payload: { model: modelId },
  });

  return NextResponse.json({ plan: result.object });
}
