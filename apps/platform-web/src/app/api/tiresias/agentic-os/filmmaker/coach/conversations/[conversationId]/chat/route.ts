/**
 * Filmmaker coach — streaming chat.
 *
 * POST the user turn; the assistant turn streams back as plain UTF-8
 * with a final JSON sentinel line prefixed by U+001E (Record Separator)
 * so the UI can detect the end of the text body and read structured
 * metadata. Filmmaker is a low-harm domain, so the trailer carries the
 * conversation id only — no crisis flag.
 *
 * 503 when `ANTHROPIC_API_KEY` is missing so the UI can render the
 * admin-action banner instead of crashing.
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { recordAudit } from '@/lib/agentic-os/filmmaker/repo';
import {
  appendMessage,
  getConversation,
  touchConversation,
} from '@/lib/agentic-os/filmmaker/coach/repo';
import { buildCoachContext } from '@/lib/agentic-os/filmmaker/coach/context';
import {
  buildSystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from '@/lib/agentic-os/filmmaker/coach/system-prompt';
import {
  callCoachLlm,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/filmmaker/coach/anthropic';

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
  const user = await getCurrentFilmmakerUser();
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
      await import('@/lib/agentic-os/filmmaker/coach/repo').then((m) =>
        m.updateConversation(conversationId, user.userId, {
          title: autoTitle(parsed.data.message),
        }),
      );
    } catch {
      // best-effort; the chat continues even if title-write fails
    }
  }

  const context = await buildCoachContext({
    projectId: conversation.projectId,
    userId: user.userId,
  });
  const systemPrompt = buildSystemPrompt(context, conversation.mode);

  // Tools DEFERRED — `@platform/llm` Wave-0 has no function-calling.
  let assistantText = '';
  let latencyMs = 0;
  try {
    const r = await callCoachLlm({
      system: systemPrompt,
      user: parsed.data.message,
      tenantId: user.tenantId,
      osSlug: 'filmmaker',
      model: modelId,
    });
    assistantText = r.text;
    latencyMs = r.latencyMs;
  } catch (err) {
    console.error('[filmmaker.coach.chat] llm error', err);
    return NextResponse.json(
      { error: 'llm_failed', message: (err as Error).message || 'LLM call failed' },
      { status: 502 },
    );
  }

  try {
    const assistantMessage = await appendMessage({
      conversationId,
      role: 'assistant',
      content: assistantText,
      toolCalls: null,
      metadata: {
        model: modelId,
        system_prompt_version: SYSTEM_PROMPT_VERSION,
        latency_ms: latencyMs,
      },
    });
    await touchConversation(conversationId, user.userId);
    await recordAudit({
      actorId: user.userId,
      action: 'filmmaker.coach.turn',
      payload: {
        conversation_id: conversationId,
        user_message_id: userMessage.id,
        assistant_message_id: assistantMessage.id,
        tool_calls: 0,
        mode: conversation.mode,
      },
      projectId: conversation.projectId,
    });
  } catch (err) {
    console.error('[filmmaker.coach.chat] persistence failed', err);
  }

  return NextResponse.json(
    {
      conversation_id: conversationId,
      text: assistantText,
      model: modelId,
      latency_ms: latencyMs,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'x-coach-conversation-id': conversationId,
      },
    },
  );
}
