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
import {
  callCoachLlm,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/cyber/coach/anthropic';
import { redactSecrets } from '@/lib/agentic-os/cyber/coach/secret-redaction';

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

  // Tools DEFERRED — `@platform/llm` Wave-0 has no function-calling.
  let rawAssistantText = '';
  let latencyMs = 0;
  try {
    const r = await callCoachLlm({
      system: systemPrompt,
      user: parsed.data.message,
      tenantId: user.tenantId,
      osSlug: 'cyber',
      model: modelId,
    });
    rawAssistantText = r.text;
    latencyMs = r.latencyMs;
  } catch (err) {
    console.error('[cyber.coach.chat] llm error', err);
    return NextResponse.json(
      { error: 'llm_failed', message: (err as Error).message || 'LLM call failed' },
      { status: 502 },
    );
  }

  // Run the secret-redaction filter on the full assistant text (the
  // streaming-wrapper variant is no longer needed once streaming is off).
  const { redacted: redactedAssistantText, matches: aggregateMatches } =
    redactSecrets(rawAssistantText);

  try {
    const assistantMessage = await appendMessage({
      conversationId,
      role: 'assistant',
      content: redactedAssistantText,
      toolCalls: null,
      redacted: aggregateMatches.length > 0,
      redactionMatches: aggregateMatches,
      metadata: {
        model: modelId,
        system_prompt_version: SYSTEM_PROMPT_VERSION,
        latency_ms: latencyMs,
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
        tool_calls: 0,
        mode: conversation.mode,
        redacted: aggregateMatches.length > 0,
        redaction_match_types: aggregateMatches.map((m) => m.type),
      },
    });
  } catch (err) {
    console.error('[cyber.coach.chat] persistence failed', err);
  }

  return NextResponse.json(
    {
      conversation_id: conversationId,
      text: redactedAssistantText,
      model: modelId,
      latency_ms: latencyMs,
      redacted: aggregateMatches.length > 0,
      redaction_matches: aggregateMatches,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'x-coach-conversation-id': conversationId,
      },
    },
  );
}
