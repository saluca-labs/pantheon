/**
 * Business coach — append a user message + stream the assistant turn.
 *
 * Wire format matches the Maker / Filmmaker / Cyber coaches: plain UTF-8 text
 * for the assistant deltas, followed by a single U+001E (Record
 * Separator) sentinel and a JSON trailer with the session id.
 *
 * Returns 503 `coach_not_configured` when `ANTHROPIC_API_KEY` is missing
 * so the UI renders the admin-action banner instead of crashing.
 *
 * @license MIT — Tiresias Business OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  appendMessages,
  autoTitle,
  getSession,
  updateSession,
  type CoachMessage,
} from '@/lib/agentic-os/business/coach/sessions-repo';
import { buildCoachContext } from '@/lib/agentic-os/business/coach/context';
import {
  buildSystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from '@/lib/agentic-os/business/coach/system-prompt';
import {
  callCoachLlm,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/business/coach/anthropic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  message: z.string().min(1).max(8000),
});

interface Props {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
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

  const { sessionId } = await params;
  const session = await getSession(sessionId, user.userId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const modelId = getCoachModelId();

  // Append the user turn immediately so the DB transcript reflects the
  // ask even if the stream errors mid-way.
  const nowIso = new Date().toISOString();
  const userTurn: CoachMessage = {
    role: 'user',
    content: parsed.data.message,
    created_at: nowIso,
  };
  await appendMessages(sessionId, user.userId, [userTurn]);

  // Auto-title on the first turn if the title is the default placeholder.
  if (
    session.title === 'New conversation' ||
    session.title === '' ||
    session.title == null
  ) {
    try {
      await updateSession(sessionId, user.userId, {
        title: autoTitle(parsed.data.message),
      });
    } catch {
      // best-effort
    }
  }

  // Build the context payload and the per-mode system prompt.
  let systemPrompt: string;
  try {
    const ctx = await buildCoachContext({
      userId: user.userId,
      mode: session.mode,
      projectId: session.projectId,
      dealId: session.dealId,
    });
    systemPrompt = buildSystemPrompt(ctx, session.mode);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'context_failed',
        message: (err as Error).message || 'Failed to build context',
      },
      { status: 400 },
    );
  }

  // Flatten transcript into a single user prompt (no multi-message API
  // in @platform/llm Wave 0).
  const transcript = [...session.messages, userTurn]
    .filter((m) => m.role === 'user' || m.role === 'assistant');
  const userBody = transcript
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  let assistantText = '';
  let latencyMs = 0;
  try {
    const r = await callCoachLlm({
      system: systemPrompt,
      user: userBody,
      tenantId: user.tenantId,
      osSlug: 'business',
      model: modelId,
    });
    assistantText = r.text;
    latencyMs = r.latencyMs;
  } catch (err) {
    console.error('[business.coach.messages] llm error', err);
    return NextResponse.json(
      { error: 'llm_failed', message: (err as Error).message || 'LLM call failed' },
      { status: 502 },
    );
  }

  try {
    const assistantTurn: CoachMessage = {
      role: 'assistant',
      content: assistantText,
      created_at: new Date().toISOString(),
    };
    await appendMessages(sessionId, user.userId, [assistantTurn]);
    await recordAudit({
      actorId: user.userId,
      action: 'business.coach.message_sent',
      payload: {
        session_id: sessionId,
        mode: session.mode,
        model: modelId,
        system_prompt_version: SYSTEM_PROMPT_VERSION,
        assistant_chars: assistantText.length,
      },
      projectId: session.projectId,
    });
  } catch (err) {
    console.error('[business.coach.messages] persistence failed', err);
  }

  return NextResponse.json(
    {
      session_id: sessionId,
      text: assistantText,
      model: modelId,
      latency_ms: latencyMs,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'x-coach-session-id': sessionId,
      },
    },
  );
}
