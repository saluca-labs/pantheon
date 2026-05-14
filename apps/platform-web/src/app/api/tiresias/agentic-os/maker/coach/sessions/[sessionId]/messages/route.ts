/**
 * Maker coach — append a user message + generate the assistant turn.
 *
 * Wave 0 migration: streaming via `streamText` is DEFERRED. This route
 * now does a single non-streaming `callCoachLlm` (backed by
 * `@platform/llm`) and returns the assistant text in a JSON body.
 * Tool-use is also deferred until `@platform/llm` grows a tools field
 * on the provider contract.
 *
 * Returns 503 `coach_not_configured` when `ANTHROPIC_API_KEY` is missing
 * so the UI renders the admin-action banner instead of crashing.
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { recordAudit } from '@/lib/agentic-os/maker/repo';
import {
  appendMessages,
  autoTitle,
  getSession,
  updateSession,
  type CoachMessage,
} from '@/lib/agentic-os/maker/coach/repo';
import { buildCoachContext } from '@/lib/agentic-os/maker/coach/context';
import {
  buildSystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from '@/lib/agentic-os/maker/coach/system-prompt';
import {
  callCoachLlm,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/maker/coach/anthropic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  message: z.string().min(1).max(8000),
});

interface Props {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
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

  // Compose the user prompt by flattening the full transcript so the
  // model sees prior turns. Wave 0 has no multi-message API on
  // `@platform/llm` — we concatenate into one string instead.
  const transcript = [...session.messages, userTurn]
    .filter((m) => m.role === 'user' || m.role === 'assistant');
  const userBody = transcript
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  let assistantText = '';
  let latencyMs = 0;
  try {
    const result = await callCoachLlm({
      system: systemPrompt,
      user: userBody,
      tenantId: user.tenantId,
      osSlug: 'maker',
      model: modelId,
    });
    assistantText = result.text;
    latencyMs = result.latencyMs;
  } catch (err) {
    console.error('[maker.coach.messages] llm error', err);
    return NextResponse.json(
      { error: 'llm_failed', message: (err as Error).message || 'LLM call failed' },
      { status: 502 },
    );
  }

  // Persist the assistant turn + audit. Best-effort like the prior
  // onFinish path; we still return the text to the client even if
  // persistence fails.
  try {
    const assistantTurn: CoachMessage = {
      role: 'assistant',
      content: assistantText,
      created_at: new Date().toISOString(),
    };
    await appendMessages(sessionId, user.userId, [assistantTurn]);
    await recordAudit({
      actorId: user.userId,
      action: 'maker.coach.turn',
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
    console.error('[maker.coach.messages] persistence failed', err);
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
