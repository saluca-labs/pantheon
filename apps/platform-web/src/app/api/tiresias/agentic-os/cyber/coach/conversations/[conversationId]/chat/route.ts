/**
 * Cyber coach — streaming chat with secret-redaction filter.
 *
 * POST the user turn; the assistant turn streams back as plain UTF-8.
 * Every chunk passes through the secret-redaction filter (AWS / RSA /
 * JWT / GitHub / Anthropic / OpenAI / Slack patterns) before the bytes
 * leave the server. A final JSON sentinel line prefixed by U+001E
 * (Record Separator) carries structured metadata (conversation_id,
 * redacted, redaction_matches) so the UI can render a "secrets were
 * auto-redacted" banner when the filter fired.
 *
 * 503 when `ANTHROPIC_API_KEY` is missing so the UI can render the
 * admin-action banner instead of crashing.
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { recordAudit } from '@/lib/agentic-os/cyber/repo';
import {
  appendMessage,
  getConversation,
  touchConversation,
  updateConversation,
} from '@/lib/agentic-os/cyber/coach/repo';
import { buildCoachContext } from '@/lib/agentic-os/cyber/coach/context';
import {
  buildSystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from '@/lib/agentic-os/cyber/coach/system-prompt';
import { buildCoachTools } from '@/lib/agentic-os/cyber/coach/tools';
import {
  getAnthropicProvider,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/cyber/coach/anthropic';
import { wrapStreamWithRedaction } from '@/lib/agentic-os/cyber/coach/secret-redaction-stream';
import { redactSecrets, type RedactionMatch } from '@/lib/agentic-os/cyber/coach/secret-redaction';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  message: z.string().min(1).max(8000),
});

interface Props {
  params: Promise<{ conversationId: string }>;
}

function autoTitle(message: string): string {
  const oneLine = message.trim().replace(/\s+/g, ' ');
  return oneLine.length <= 60 ? oneLine : oneLine.slice(0, 59) + '…';
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentCyberUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isCoachConfigured()) {
    return NextResponse.json(
      {
        error: 'coach_not_configured',
        message:
          'AI coach not yet configured — admin needs to set ANTHROPIC_API_KEY.',
      },
      { status: 503 },
    );
  }

  const { conversationId } = await params;
  const conversation = await getConversation(conversationId, user.userId);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const modelId = getCoachModelId();

  const userMessage = await appendMessage({
    conversationId,
    role: 'user',
    content: parsed.data.message,
  });

  // Auto-title the conversation on the first user turn.
  if (!conversation.title) {
    try {
      await updateConversation(conversationId, user.userId, {
        title: autoTitle(parsed.data.message),
      });
    } catch {
      // best-effort; the chat continues even if title-write fails
    }
  }

  const context = await buildCoachContext({
    ownerId: user.userId,
    caseId: conversation.caseId,
    mode: conversation.mode,
  });
  const systemPrompt = buildSystemPrompt(context, conversation.mode);

  const tools = buildCoachTools({
    ownerId: user.userId,
    conversationId,
    caseId: conversation.caseId,
  });

  const provider = getAnthropicProvider();

  const uiMessages: UIMessage[] = [
    {
      id: userMessage.id,
      role: 'user',
      parts: [{ type: 'text', text: parsed.data.message }],
    },
  ];

  const modelMessages = await convertToModelMessages(uiMessages);

  // Track the redacted assistant text + match summary as the stream flows so
  // we can persist them in onFinish (and surface to the UI via the trailer).
  let redactedAssistantText = '';
  let aggregateMatches: RedactionMatch[] = [];

  const result = streamText({
    model: provider(modelId),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
    async onFinish(event) {
      try {
        // Defensive: re-redact the final text in case the streaming wrapper
        // missed an end-of-stream split. This is the canonical authoritative
        // text we persist.
        const rawText = event.text ?? '';
        const finalRedacted = redactSecrets(rawText);
        const finalText = redactedAssistantText || finalRedacted.redacted;
        const finalMatches: RedactionMatch[] = aggregateMatches.length
          ? aggregateMatches
          : finalRedacted.matches;

        const toolCalls = (event.toolCalls ?? []).map((tc) => ({
          id: tc.toolCallId,
          name: tc.toolName,
          input: tc.input,
        }));
        const assistantMessage = await appendMessage({
          conversationId,
          role: 'assistant',
          content: finalText,
          toolCalls: toolCalls.length ? toolCalls : null,
          redacted: finalMatches.length > 0,
          redactionMatches: finalMatches,
          metadata: {
            model: modelId,
            system_prompt_version: SYSTEM_PROMPT_VERSION,
            usage: event.totalUsage,
          },
        });
        await touchConversation(conversationId, user.userId);
        await recordAudit({
          actorId: user.userId,
          action: 'cyber.coach.turn',
          payload: {
            conversation_id: conversationId,
            user_message_id: userMessage.id,
            assistant_message_id: assistantMessage.id,
            tool_calls: toolCalls.length,
            mode: conversation.mode,
            redacted: finalMatches.length > 0,
            redaction_match_types: finalMatches.map((m) => m.type),
          },
        });
      } catch (err) {
        console.error('[cyber.coach.chat] onFinish persistence failed', err);
      }
    },
  });

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          const filtered = wrapStreamWithRedaction(
            result.textStream,
            (matches) => {
              aggregateMatches = matches;
            },
          );
          for await (const chunk of filtered) {
            redactedAssistantText += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          console.error('[cyber.coach.chat] stream error', err);
        } finally {
          const sentinel =
            String.fromCharCode(0x1e) +
            JSON.stringify({
              conversation_id: conversationId,
              redacted: aggregateMatches.length > 0,
              redaction_matches: aggregateMatches,
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
