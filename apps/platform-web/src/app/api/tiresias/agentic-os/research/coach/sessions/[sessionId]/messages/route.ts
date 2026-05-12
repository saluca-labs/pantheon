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
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
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
  getAnthropicProvider,
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

const RECORD_SEPARATOR = String.fromCharCode(0x1e);

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

  // Compose UI messages from the full transcript so the model sees prior
  // turns. The user turn we just appended is included.
  const transcript = [...session.messages, userTurn];
  const uiMessages: UIMessage[] = transcript
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m, i) => ({
      id: `${sessionId}-${i}`,
      role: m.role as 'user' | 'assistant',
      parts: [{ type: 'text', text: m.content }],
    }));

  const provider = getAnthropicProvider();
  const modelMessages = await convertToModelMessages(uiMessages);
  const result = streamText({
    model: provider(modelId),
    system: systemPrompt,
    messages: modelMessages,
  });

  const sessionExperimentId = session.experimentId;
  const sessionMode = session.mode;

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        let assistantText = '';
        try {
          for await (const delta of result.textStream) {
            assistantText += delta;
            controller.enqueue(encoder.encode(delta));
          }
        } catch (err) {
          console.error('[research.coach.messages] stream error', err);
        }

        // Persist the assistant turn unconditionally (transcript is the
        // source of truth even if downstream bookkeeping fails).
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
          console.error(
            '[research.coach.messages] persistence failed',
            err,
          );
        }

        const trailer = {
          session_id: sessionId,
          mode: sessionMode,
          system_prompt_version: SYSTEM_PROMPT_VERSION,
          context_truncated: contextTruncated,
        };
        controller.enqueue(
          encoder.encode(RECORD_SEPARATOR + JSON.stringify(trailer) + '\n'),
        );
        controller.close();
      },
    }),
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'x-coach-session-id': sessionId,
      },
    },
  );
}
