/**
 * Research coach — append a user message + stream the assistant turn.
 *
 * Wire format matches the Autobiographer / Maker / Filmmaker / Cyber
 * coaches exactly: plain UTF-8 deltas for the assistant text, followed
 * by a single U+001E (Record Separator) sentinel and a JSON trailer.
 * The trailer carries:
 *
 *   { session_id, mode, system_prompt_version, context_truncated }
 *
 * Returns 503 `coach_not_configured` when `ANTHROPIC_API_KEY` is missing
 * so the UI renders the admin-action banner instead of crashing.
 *
 * Unlike Autobiographer (chapter-revision commit), Research's coach
 * performs NO cross-table writes — the transcript is the only durable
 * artifact. Users persist hypotheses / notebook entries / evidence
 * through their existing routes.
 *
 * The methods_advisor regulated-advice refusal is enforced at the
 * system-prompt layer via `buildSystemPrompt(ctx, mode, userPrompt)` —
 * the user's most recent turn is scanned by `detectRegulatedTopics`
 * and, on hit, the referral footer is appended to the system prompt
 * pinned to this turn.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  appendMessages,
  autoTitle,
  getSession,
  patchMetadata,
  updateSession,
  type CoachMessage,
} from '@/lib/agentic-os/research/coach/sessions-repo';
import { buildCoachContext } from '@/lib/agentic-os/research/coach/context';
import {
  buildSystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from '@/lib/agentic-os/research/coach/system-prompt';
import {
  callCoachLlm,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/research/coach/anthropic';
import { detectRegulatedTopics } from '@/lib/agentic-os/research/coach/safety';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  message: z.string().min(1).max(8000),
});

interface Props {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isCoachConfigured()) {
    return NextResponse.json(
      {
        error: 'coach_not_configured',
        message: 'Research Coach is not yet configured for this environment.',
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

  // Auto-title on the first turn if the title is still the default
  // placeholder.
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
  let contextTruncated = false;
  let regulatedTopicsHit: string[] = [];
  try {
    const built = await buildCoachContext({
      userId: user.userId,
      mode: session.mode,
      experimentId: session.experimentId,
    });
    systemPrompt = buildSystemPrompt(
      built.context,
      session.mode,
      parsed.data.message,
    );
    contextTruncated = built.truncated;
    if (session.mode === 'methods_advisor') {
      regulatedTopicsHit = detectRegulatedTopics(parsed.data.message);
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: 'context_failed',
        message: (err as Error).message || 'Failed to build context',
      },
      { status: 400 },
    );
  }

  // Compose user prompt by flattening transcript so the model sees prior
  // turns. Wave 0: `@platform/llm` has no multi-message API yet, so we
  // concatenate.
  const transcript = [...session.messages, userTurn]
    .filter((m) => m.role === 'user' || m.role === 'assistant');
  const userBody = transcript
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const sessionExperimentId = session.experimentId;
  const sessionMode = session.mode;

  let assistantText = '';
  let latencyMs = 0;
  try {
    const r = await callCoachLlm({
      system: systemPrompt,
      user: userBody,
      tenantId: user.tenantId,
      osSlug: 'research',
      model: modelId,
    });
    assistantText = r.text;
    latencyMs = r.latencyMs;
  } catch (err) {
    console.error('[research.coach.messages] llm error', err);
    return NextResponse.json(
      { error: 'llm_failed', message: (err as Error).message || 'LLM call failed' },
      { status: 502 },
    );
  }

  // Persist the assistant turn (transcript is the source of truth even
  // if downstream bookkeeping fails).
  try {
    const assistantTurn: CoachMessage = {
      role: 'assistant',
      content: assistantText,
      created_at: new Date().toISOString(),
    };
    await appendMessages(sessionId, user.userId, [assistantTurn]);
    await patchMetadata(sessionId, user.userId, {
      system_prompt_version: SYSTEM_PROMPT_VERSION,
      last_regulated_topics: regulatedTopicsHit,
    });
    await recordAudit({
      actorId: user.userId,
      action: 'research.coach.message_appended',
      payload: {
        session_id: sessionId,
        mode: sessionMode,
        model: modelId,
        system_prompt_version: SYSTEM_PROMPT_VERSION,
        context_truncated: contextTruncated,
        assistant_chars: assistantText.length,
        regulated_topics: regulatedTopicsHit,
      },
      projectId: sessionExperimentId,
    });
  } catch (err) {
    console.error('[research.coach.messages] persistence failed', err);
  }

  return NextResponse.json(
    {
      session_id: sessionId,
      mode: sessionMode,
      text: assistantText,
      model: modelId,
      latency_ms: latencyMs,
      system_prompt_version: SYSTEM_PROMPT_VERSION,
      context_truncated: contextTruncated,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'x-coach-session-id': sessionId,
      },
    },
  );
}
