/**
 * Autobiographer coach — one-shot quick prompt (no persistence).
 *
 * Used by the "prompt suggestions" UI so the user can poke at a starter
 * prompt without creating a session row. Streams the assistant turn in
 * the same wire format as the session messages route (plain UTF-8 +
 * U+001E trailer). Returns 503 cleanly when `ANTHROPIC_API_KEY` is
 * missing.
 *
 * Note: this route does NOT audit (no durable artifact, nothing to
 * audit-trail). It also does NOT verify book ownership if `book_id`
 * is provided — the context loader will throw if the user passes a
 * bookId they don't own and that bubbles up as a 400 here.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { COACH_MODE_VALUES } from '@/lib/agentic-os/autobiographer/coach/modes';
import { buildCoachContext } from '@/lib/agentic-os/autobiographer/coach/context';
import {
  buildSystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from '@/lib/agentic-os/autobiographer/coach/system-prompt';
import {
  callCoachLlm,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/autobiographer/coach/anthropic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  mode: z.enum(COACH_MODE_VALUES as unknown as [string, ...string[]]),
  book_id: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(8000),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isCoachConfigured()) {
    return NextResponse.json(
      {
        error: 'coach_not_configured',
        message:
          'Autobiographer Coach is not yet configured for this environment.',
      },
      { status: 503 },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let systemPrompt: string;
  let contextTruncated = false;
  try {
    const built = await buildCoachContext({
      userId: user.userId,
      mode: parsed.data.mode as (typeof COACH_MODE_VALUES)[number],
      bookId: parsed.data.book_id ?? null,
    });
    systemPrompt = buildSystemPrompt(
      built.context,
      parsed.data.mode as (typeof COACH_MODE_VALUES)[number],
    );
    contextTruncated = built.truncated;
  } catch (err) {
    return NextResponse.json(
      {
        error: 'context_failed',
        message: (err as Error).message || 'Failed to build context',
      },
      { status: 400 },
    );
  }

  const modelId = getCoachModelId();
  let text = '';
  let latencyMs = 0;
  try {
    const r = await callCoachLlm({
      system: systemPrompt,
      user: parsed.data.message,
      tenantId: user.tenantId,
      osSlug: 'autobiographer',
      model: modelId,
    });
    text = r.text;
    latencyMs = r.latencyMs;
  } catch (err) {
    console.error('[autobiographer.coach.quick] llm error', err);
    return NextResponse.json(
      { error: 'llm_failed', message: (err as Error).message || 'LLM call failed' },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      mode: parsed.data.mode,
      text,
      model: modelId,
      latency_ms: latencyMs,
      system_prompt_version: SYSTEM_PROMPT_VERSION,
      context_truncated: contextTruncated,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
