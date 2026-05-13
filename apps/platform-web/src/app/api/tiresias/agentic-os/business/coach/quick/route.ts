/**
 * Business coach — one-shot quick prompt (no persistence).
 *
 * Used by the "prompt suggestions" UI so the user can poke at a starter
 * prompt without creating a session row. Streams the assistant turn in
 * the same wire format as the session messages route (plain text +
 * U+001E trailer). Returns 503 cleanly when `ANTHROPIC_API_KEY` is
 * missing.
 *
 * Note: this route does NOT audit. It produces no durable artifact
 * (no session, no transcript), so there's nothing to audit-trail.
 *
 * @license MIT — Tiresias Business OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { COACH_MODE_VALUES } from '@/lib/agentic-os/business/coach/modes';
import { buildCoachContext } from '@/lib/agentic-os/business/coach/context';
import { buildSystemPrompt } from '@/lib/agentic-os/business/coach/system-prompt';
import {
  callCoachLlm,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/business/coach/anthropic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  mode: z.enum(COACH_MODE_VALUES as unknown as [string, ...string[]]),
  project_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(8000),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isCoachConfigured()) {
    return NextResponse.json(
      {
        error: 'coach_not_configured',
        message: 'Business Coach is not yet configured for this environment.',
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
  try {
    const ctx = await buildCoachContext({
      userId: user.userId,
      mode: parsed.data.mode as (typeof COACH_MODE_VALUES)[number],
      projectId: parsed.data.project_id ?? null,
      dealId: parsed.data.deal_id ?? null,
    });
    systemPrompt = buildSystemPrompt(
      ctx,
      parsed.data.mode as (typeof COACH_MODE_VALUES)[number],
    );
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
      osSlug: 'business',
      model: modelId,
    });
    text = r.text;
    latencyMs = r.latencyMs;
  } catch (err) {
    console.error('[business.coach.quick] llm error', err);
    return NextResponse.json(
      { error: 'llm_failed', message: (err as Error).message || 'LLM call failed' },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { mode: parsed.data.mode, text, model: modelId, latency_ms: latencyMs },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
