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
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { COACH_MODE_VALUES } from '@/lib/agentic-os/autobiographer/coach/modes';
import { buildCoachContext } from '@/lib/agentic-os/autobiographer/coach/context';
import {
  buildSystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from '@/lib/agentic-os/autobiographer/coach/system-prompt';
import {
  getAnthropicProvider,
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

const RECORD_SEPARATOR = String.fromCharCode(0x1e);

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
          console.error('[autobiographer.coach.quick] stream error', err);
        } finally {
          const trailer = {
            mode: parsed.data.mode,
            system_prompt_version: SYSTEM_PROMPT_VERSION,
            context_truncated: contextTruncated,
          };
          controller.enqueue(
            encoder.encode(RECORD_SEPARATOR + JSON.stringify(trailer) + '\n'),
          );
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
