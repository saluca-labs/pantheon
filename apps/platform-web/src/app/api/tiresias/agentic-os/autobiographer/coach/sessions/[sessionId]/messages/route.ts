/**
 * Autobiographer coach — append a user message + stream the assistant turn.
 *
 * Wire format matches Maker / Filmmaker / Cyber exactly: plain UTF-8
 * deltas for the assistant text, followed by a single U+001E (Record
 * Separator) sentinel and a JSON trailer. The trailer carries:
 *
 *   { session_id, mode, system_prompt_version, context_truncated,
 *     citations? (chapter_drafter only), committed_revision_id? }
 *
 * Returns 503 `coach_not_configured` when `ANTHROPIC_API_KEY` is missing
 * so the UI renders the admin-action banner instead of crashing.
 *
 * Chapter-drafter commit flow
 * ---------------------------
 * When the body sets `commit_to_chapter: true` AND `chapter_id` is
 * provided AND the session's mode is `chapter_drafter`, after the
 * stream finishes the route ALSO writes a new `chapter_revision` row
 * with `author='coach'`, `coach_session_id=<this session>`, citations
 * parsed from the assistant's `[cites: …]` lines. The trailer echoes
 * the new revision id. This is the only cross-table write the coach
 * performs.
 *
 * Default behavior (no `commit_to_chapter` flag) is stream-only: append
 * the assistant turn to the session transcript, no chapter_revisions
 * write.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import {
  appendMessages,
  autoTitle,
  getSession,
  patchMetadata,
  updateSession,
  type CoachMessage,
} from '@/lib/agentic-os/autobiographer/coach/sessions-repo';
import { buildCoachContext } from '@/lib/agentic-os/autobiographer/coach/context';
import {
  buildSystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from '@/lib/agentic-os/autobiographer/coach/system-prompt';
import {
  callCoachLlm,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/autobiographer/coach/anthropic';
import { insertRevision } from '@/lib/agentic-os/autobiographer/chapter-revisions-repo';
import { getChapter } from '@/lib/agentic-os/autobiographer/chapters-repo';
import { parseCitations } from '@/lib/agentic-os/autobiographer/coach/citations';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  message: z.string().min(1).max(8000),
  /** chapter_drafter only: when true, persist a chapter_revision on success. */
  commit_to_chapter: z.boolean().optional(),
  /** chapter_drafter commit only: target chapter (verified to belong to caller). */
  chapter_id: z.string().uuid().optional(),
});

interface Props {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentAutobiographerUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isCoachConfigured()) {
    return NextResponse.json(
      {
        error: 'coach_not_configured',
        message:
          'Autobiographer Coach is not yet configured for this environment.',
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

  const commitToChapter =
    parsed.data.commit_to_chapter === true &&
    typeof parsed.data.chapter_id === 'string' &&
    session.mode === 'chapter_drafter';

  // Validate the chapter belongs to the caller AND to the session's book
  // before we burn an Anthropic call.
  if (commitToChapter) {
    const chapter = await getChapter(parsed.data.chapter_id!, user.userId);
    if (!chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }
    if (session.bookId && chapter.bookId !== session.bookId) {
      return NextResponse.json(
        { error: 'Chapter does not belong to this session’s book' },
        { status: 400 },
      );
    }
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
  let sourceMemoryIds: string[] = [];
  let voiceProfileId: string | null = null;
  try {
    const built = await buildCoachContext({
      userId: user.userId,
      mode: session.mode,
      bookId: session.bookId,
      chapterId: parsed.data.chapter_id ?? null,
    });
    systemPrompt = buildSystemPrompt(built.context, session.mode);
    contextTruncated = built.truncated;
    if (built.context.mode === 'chapter_drafter') {
      sourceMemoryIds = built.context.data.source_memories.map(
        (s) => s.memory_id,
      );
      voiceProfileId = built.context.data.voice_profile?.id ?? null;
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

  // Flatten transcript into a single user prompt (no multi-message API
  // in @platform/llm Wave 0).
  const transcript = [...session.messages, userTurn]
    .filter((m) => m.role === 'user' || m.role === 'assistant');
  const userBody = transcript
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const sessionBookId = session.bookId;
  const sessionMode = session.mode;

  let assistantText = '';
  let latencyMs = 0;
  try {
    const r = await callCoachLlm({
      system: systemPrompt,
      user: userBody,
      tenantId: user.tenantId,
      osSlug: 'autobiographer',
      model: modelId,
    });
    assistantText = r.text;
    latencyMs = r.latencyMs;
  } catch (err) {
    console.error('[autobiographer.coach.messages] llm error', err);
    return NextResponse.json(
      { error: 'llm_failed', message: (err as Error).message || 'LLM call failed' },
      { status: 502 },
    );
  }

  // Persist the assistant turn unconditionally (transcript is the
  // source of truth even if the chapter-revision commit fails).
  try {
    const assistantTurn: CoachMessage = {
      role: 'assistant',
      content: assistantText,
      created_at: new Date().toISOString(),
    };
    await appendMessages(sessionId, user.userId, [assistantTurn]);
    await patchMetadata(sessionId, user.userId, {
      system_prompt_version: SYSTEM_PROMPT_VERSION,
      last_source_memory_ids: sourceMemoryIds,
      last_voice_profile_id: voiceProfileId,
    });
    await recordAudit({
      actorId: user.userId,
      action: 'autobiographer.coach.message_sent',
      payload: {
        session_id: sessionId,
        mode: sessionMode,
        model: modelId,
        system_prompt_version: SYSTEM_PROMPT_VERSION,
        context_truncated: contextTruncated,
        assistant_chars: assistantText.length,
      },
      projectId: sessionBookId,
    });
  } catch (err) {
    console.error('[autobiographer.coach.messages] persistence failed', err);
  }

  // Chapter-drafter commit path.
  let citations: ReturnType<typeof parseCitations> = [];
  let committedRevisionId: string | null = null;
  if (commitToChapter && assistantText.trim().length > 0) {
    try {
      citations = parseCitations(assistantText);
      const revision = await insertRevision(user.userId, {
        chapterId: parsed.data.chapter_id!,
        author: 'coach',
        bodyText: assistantText,
        summary: null,
        citations,
        coachSessionId: sessionId,
      });
      committedRevisionId = revision.id;
      await recordAudit({
        actorId: user.userId,
        action: 'autobiographer.coach.draft_committed',
        payload: {
          session_id: sessionId,
          chapter_id: parsed.data.chapter_id,
          revision_id: revision.id,
          version: revision.version,
          paragraph_count: citations.length,
        },
        projectId: sessionBookId,
      });
    } catch (err) {
      console.error(
        '[autobiographer.coach.messages] commit_to_chapter failed',
        err,
      );
    }
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
      citations,
      committed_revision_id: committedRevisionId,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'x-coach-session-id': sessionId,
      },
    },
  );
}
