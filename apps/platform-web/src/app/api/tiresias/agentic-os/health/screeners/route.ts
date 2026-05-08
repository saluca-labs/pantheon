import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { scoreScreener, getScreener, type ScreenerKey } from '@/lib/agentic-os/health/screeners';
import { recordScreener, listScreeners, recordAudit } from '@/lib/agentic-os/health/repo';

const SubmitBody = z.object({
  screener: z.enum(['phq9', 'gad7']),
  answers: z.array(z.number().int().min(0).max(3)),
});

export async function GET() {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rows = await listScreeners(user.userId);
  return NextResponse.json({ items: rows });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = SubmitBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const def = getScreener(parsed.data.screener);
  if (!def || parsed.data.answers.length !== def.questions.length) {
    return NextResponse.json(
      {
        error: `Expected ${def?.questions.length ?? 0} answers for ${parsed.data.screener}`,
      },
      { status: 400 },
    );
  }

  const result = scoreScreener(parsed.data.screener as ScreenerKey, parsed.data.answers);
  const row = await recordScreener({
    userId: user.userId,
    screener: parsed.data.screener as ScreenerKey,
    answers: parsed.data.answers,
    score: result.score,
    severity: result.severity,
    crisisFlag: result.crisisFlag,
  });
  await recordAudit({
    actorId: user.userId,
    action: 'health.screener.submitted',
    payload: {
      screener: parsed.data.screener,
      score: result.score,
      severity: result.severity,
      crisisFlag: result.crisisFlag,
    },
  });

  return NextResponse.json({ result: row });
}
