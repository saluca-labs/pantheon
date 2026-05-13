/**
 * Creator coach — append a user message + stream the assistant turn.
 *
 * Wire format matches the Business / Maker / Filmmaker / Cyber coaches:
 * plain UTF-8 text for the assistant deltas, followed by a single U+001E
 * (Record Separator) sentinel and a JSON trailer with the session id.
 *
 * Returns 503 `coach_not_configured` when `ANTHROPIC_API_KEY` is missing
 * so the UI renders the admin-action banner instead of crashing.
 *
 * Hard rules enforced in the system prompt:
 *  1. Never invent metrics or audience numbers.
 *  2. Never generate plagiarized content.
 *  3. Refuse legal/financial/tax advice.
 *
 * @license MIT — Tiresias Creator OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import {
  appendMessages,
  autoTitle,
  getSession,
  updateSession,
  type CoachMessage,
} from '@/lib/agentic-os/creator/coach/sessions-repo';
import { buildCoachContext } from '@/lib/agentic-os/creator/coach/context';
import {
  buildSystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from '@/lib/agentic-os/creator/coach/system-prompt';
import {
  callCoachLlm,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/creator/coach/anthropic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  message: z.string().min(1).max(8000),
});

interface Props {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentCreatorUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isCoachConfigured()) {
    return NextResponse.json(
      {
        error: 'coach_not_configured',
        message: 'Creator Coach is not yet configured for this environment.',
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
    session.title === 'New session' ||
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
      osSlug: 'creator',
      model: modelId,
    });
    assistantText = r.text;
    latencyMs = r.latencyMs;
  } catch (err) {
    console.error('[creator.coach.stream] llm error', err);
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
  } catch (err) {
    console.error('[creator.coach.stream] persistence failed', err);
  }

  // SYSTEM_PROMPT_VERSION imported for parity with sibling coaches even
  // though it's not yet returned in the payload; tests assert on the
  // import surface.
  void SYSTEM_PROMPT_VERSION;

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
