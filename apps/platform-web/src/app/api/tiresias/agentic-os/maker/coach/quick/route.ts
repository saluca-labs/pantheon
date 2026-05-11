/**
 * Maker coach — one-shot quick prompt (no persistence).
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
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { COACH_MODE_VALUES } from '@/lib/agentic-os/maker/coach/modes';
import { buildCoachContext } from '@/lib/agentic-os/maker/coach/context';
import { buildSystemPrompt } from '@/lib/agentic-os/maker/coach/system-prompt';
import {
  getAnthropicProvider,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/maker/coach/anthropic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  mode: z.enum(COACH_MODE_VALUES as unknown as [string, ...string[]]),
  project_id: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(8000),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentMakerUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isCoachConfigured()) {
    return NextResponse.json(
      {
        error: 'coach_not_configured',
        message: 'Maker Coach is not yet configured for this environment.',
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
  const provider = getAnthropicProvider();
  const uiMessages: UIMessage[] = [
    {
      id: 'quick-0',
      role: 'user',
      parts: [{ type: 'text', text: parsed.data.message }],
    },
  ];
  const modelMessages = await convertToModelMessages(uiMessages);
  const result = streamText({
    model: provider(modelId),
    system: systemPrompt,
    messages: modelMessages,
  });

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const delta of result.textStream) {
            controller.enqueue(encoder.encode(delta));
          }
        } catch (err) {
          console.error('[maker.coach.quick] stream error', err);
        } finally {
          const sentinel =
            String.fromCharCode(0x1e) +
            JSON.stringify({ mode: parsed.data.mode }) +
            '\n';
          controller.enqueue(encoder.encode(sentinel));
          controller.close();
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}
