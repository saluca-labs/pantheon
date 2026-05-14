import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { recordAudit, recordRiskFlag } from '@/lib/agentic-os/health/repo';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';
import { buildCoachContext } from '@/lib/agentic-os/health/coach/context';
import {
  buildSystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from '@/lib/agentic-os/health/coach/system-prompt';
import {
  appendMessage,
  createConversation,
  getConversation,
  markMessageCrisis,
  touchConversation,
} from '@/lib/agentic-os/health/coach/repo';
import { createCrisisMonitor } from '@/lib/agentic-os/health/coach/crisis-stream-filter';
import {
  callCoachLlm,
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

  // Crisis monitor scans the assistant reply for risk language. With
  // streaming gone (Wave 0) we feed the whole reply in one shot.
  const monitor = createCrisisMonitor({
    source: 'health.coach.assistant_reply',
    persistFlag: (flag) =>
      recordRiskFlag(user.userId, user.tenantId, flag).then(() => undefined),
  });

  // Tools are DEFERRED — `@platform/llm` has no function-calling field
  // yet. The Wave-0 coach is a single-turn text-completion only.
  let assistantText = '';
  let latencyMs = 0;
  try {
    const r = await callCoachLlm({
      system: systemPrompt,
      user: parsed.data.message,
      tenantId: user.tenantId,
      osSlug: 'health',
      model: modelId,
    });
    assistantText = r.text;
    latencyMs = r.latencyMs;
  } catch (err) {
    console.error('[coach.chat] llm error', err);
    return NextResponse.json(
      { error: 'llm_failed', message: (err as Error).message || 'LLM call failed' },
      { status: 502 },
    );
  }

  // Feed the full assistant reply through the crisis monitor in one
  // pass (the streaming-delta path is gone).
  monitor.ingest(assistantText);
  const finalCrisis = monitor.result();

  // Persist + audit. Best-effort, mirroring the prior onFinish handler.
  try {
    const assistantMessage = await appendMessage({
      conversationId,
      role: 'assistant',
      content: assistantText,
      toolCalls: null,
      crisisDetected: finalCrisis.matched,
      metadata: {
        model: modelId,
        latency_ms: latencyMs,
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
        tool_calls: 0,
        crisis_detected: finalCrisis.matched,
      },
    });
  } catch (err) {
    console.error('[coach.chat] persistence failed', err);
  }

  return NextResponse.json(
    {
      conversation_id: conversationId,
      text: assistantText,
      model: modelId,
      latency_ms: latencyMs,
      crisis_detected: finalCrisis.matched,
      crisis_matches: finalCrisis.matches,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'x-coach-conversation-id': conversationId,
      },
    },
  );
}
