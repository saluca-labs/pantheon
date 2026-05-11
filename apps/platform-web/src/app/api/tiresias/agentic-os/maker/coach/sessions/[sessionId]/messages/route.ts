/**
 * Maker coach — append a user message + stream the assistant turn.
 *
 * Wire format matches the Filmmaker / Cyber coaches: plain UTF-8 text
 * for the assistant deltas, followed by a single U+001E (Record
 * Separator) sentinel and a JSON trailer with the session id. The trailer
 * does NOT carry a redaction flag — the Maker coach is a low-harm domain
 * (no secret-redaction filter).
 *
 * Returns 503 `coach_not_configured` when `ANTHROPIC_API_KEY` is missing
 * so the UI renders the admin-action banner instead of crashing.
 *
 * @license MIT — Tiresias Maker OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
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
  getAnthropicProvider,
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

  // Compose UI messages from the full transcript so the model sees prior
  // turns. The user turn we just appended is included; the assistant
  // placeholder is added by streamText.
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
    async onFinish(event) {
      try {
        const assistantText = event.text ?? '';
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
    },
  });

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const delta of result.textStream) {
            controller.enqueue(encoder.encode(delta));
          }
        } catch (err) {
          console.error('[maker.coach.messages] stream error', err);
        } finally {
          const sentinel =
            String.fromCharCode(0x1e) +
            JSON.stringify({ session_id: sessionId }) +
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
        'x-coach-session-id': sessionId,
      },
    },
  );
}
