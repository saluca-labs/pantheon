import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { recordAudit, recordRiskFlag } from '@/lib/agentic-os/health/repo';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';
import { buildCoachContext } from '@/lib/agentic-os/health/coach/context';
import {
  buildSystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from '@/lib/agentic-os/health/coach/system-prompt';
import { buildCoachTools } from '@/lib/agentic-os/health/coach/tools';
import {
  appendMessage,
  createConversation,
  getConversation,
  markMessageCrisis,
  touchConversation,
} from '@/lib/agentic-os/health/coach/repo';
import { createCrisisMonitor } from '@/lib/agentic-os/health/coach/crisis-stream-filter';
import {
  getAnthropicProvider,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/health/coach/anthropic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  conversation_id: z.string().uuid().optional(),
  message: z.string().min(1).max(8000),
});

function autoTitle(message: string): string {
  const oneLine = message.trim().replace(/\s+/g, ' ');
  return oneLine.length <= 60 ? oneLine : oneLine.slice(0, 59) + '…';
}

export async function POST(request: NextRequest) {
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

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const modelId = getCoachModelId();

  let conversation =
    parsed.data.conversation_id
      ? await getConversation(parsed.data.conversation_id, user.tenantId, user.userId)
      : null;
  if (parsed.data.conversation_id && !conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  if (!conversation) {
    conversation = await createConversation({
      tenantId: user.tenantId,
      userId: user.userId,
      title: autoTitle(parsed.data.message),
      model: modelId,
      systemPromptVersion: SYSTEM_PROMPT_VERSION,
    });
  }
  const conversationId = conversation.id;

  // Persist user turn, with crisis-guard on the free text.
  const userMessage = await withCrisisGuard(
    parsed.data,
    {
      osSlug: 'health',
      source: 'health.coach.user_message',
      extractText: (b) => [b.message],
      persistFlag: (flag) =>
        recordRiskFlag(user.userId, user.tenantId, flag).then(() => undefined),
    },
    () =>
      appendMessage({
        conversationId,
        role: 'user',
        content: parsed.data.message,
      }),
  );

  const context = await buildCoachContext({
    tenantId: user.tenantId,
    userId: user.userId,
  });
  const systemPrompt = buildSystemPrompt(context);

  const tools = buildCoachTools({
    tenantId: user.tenantId,
    userId: user.userId,
    conversationId,
  });

  const provider = getAnthropicProvider();

  // Crisis monitor accumulates the assistant's deltas and fires a risk
  // flag on the first match. Non-blocking — the stream is never paused.
  const monitor = createCrisisMonitor({
    source: 'health.coach.assistant_reply',
    persistFlag: (flag) =>
      recordRiskFlag(user.userId, user.tenantId, flag).then(() => undefined),
  });

  // Build the message list. Persistence keeps an authoritative history
  // server-side, but the chat route also accepts the raw freshly-typed
  // user message from the client and the upstream prompt instead of a
  // full UIMessage payload. We synthesize a single-turn UI message
  // history (user turn just persisted) and let streamText reason over it.
  const uiMessages: UIMessage[] = [
    {
      id: userMessage.id,
      role: 'user',
      parts: [{ type: 'text', text: parsed.data.message }],
    },
  ];

  const modelMessages = await convertToModelMessages(uiMessages);
  const result = streamText({
    model: provider(modelId),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
    onChunk({ chunk }) {
      if (chunk.type === 'text-delta') {
        monitor.ingest(chunk.text);
      }
    },
    async onFinish(event) {
      try {
        const assistantText = event.text ?? '';
        const toolCalls = (event.toolCalls ?? []).map((tc) => ({
          id: tc.toolCallId,
          name: tc.toolName,
          input: tc.input,
        }));
        const finalCrisis = monitor.result();
        const assistantMessage = await appendMessage({
          conversationId,
          role: 'assistant',
          content: assistantText,
          toolCalls: toolCalls.length ? toolCalls : null,
          crisisDetected: finalCrisis.matched,
          metadata: {
            model: modelId,
            usage: event.totalUsage,
          },
        });
        if (finalCrisis.matched) {
          await markMessageCrisis(assistantMessage.id, finalCrisis.matches);
        }
        await touchConversation(conversationId, user.tenantId, user.userId);
        await recordAudit({
          actorId: user.userId,
          action: 'health.coach.turn',
          payload: {
            conversation_id: conversationId,
            user_message_id: userMessage.id,
            assistant_message_id: assistantMessage.id,
            tool_calls: toolCalls.length,
            crisis_detected: finalCrisis.matched,
          },
        });
      } catch (err) {
        console.error('[coach.chat] onFinish persistence failed', err);
      }
    },
  });

  // Stream the assistant text as plain UTF-8 with a final JSON sentinel
  // line prefixed by U+001E (Record Separator) so the UI can detect the
  // end of the text body and read structured metadata (crisis flag,
  // conversation id) without an extra round-trip.
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const delta of result.textStream) {
            controller.enqueue(encoder.encode(delta));
          }
        } catch (err) {
          console.error('[coach.chat] stream error', err);
        } finally {
          const finalCrisis = monitor.result();
          // U+001E (Record Separator) marks the boundary between text body
          // and JSON metadata trailer. UI splits on this character.
          const sentinel =
            String.fromCharCode(0x1e) +
            JSON.stringify({
              conversation_id: conversationId,
              crisis_detected: finalCrisis.matched,
              crisis_matches: finalCrisis.matches,
            }) +
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
        'x-coach-conversation-id': conversationId,
      },
    },
  );
}
