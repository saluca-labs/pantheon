/**
 * Autobiographer coach — list + create sessions.
 *
 * GET   — list current user's sessions, optional `mode` / `book_id` /
 *         `scope=workshop` filters, paginated `limit` / `offset`.
 * POST  — create a new session. Returns 503 `coach_not_configured` if
 *         `ANTHROPIC_API_KEY` is missing. 404 if `book_id` doesn't
 *         belong to caller. Audited.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { recordAudit } from '@/lib/agentic-os/autobiographer/repo';
import { getBook } from '@/lib/agentic-os/autobiographer/books-repo';
import {
  createSession,
  listSessions,
  autoTitle,
  type CoachMessage,
} from '@/lib/agentic-os/autobiographer/coach/sessions-repo';
import { COACH_MODE_VALUES, type CoachMode } from '@/lib/agentic-os/autobiographer/coach/modes';
import { isCoachConfigured } from '@/lib/agentic-os/autobiographer/coach/anthropic';
import { SYSTEM_PROMPT_VERSION } from '@/lib/agentic-os/autobiographer/coach/system-prompt';

export const dynamic = 'force-dynamic';

const CreateBody = z.object({
  mode: z.enum(COACH_MODE_VALUES as unknown as [string, ...string[]]),
  book_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(120).optional(),
  initial_message: z.string().min(1).max(8000).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const bookId = url.searchParams.get('book_id');
  const scopeParam = url.searchParams.get('scope');
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');

  if (mode && !(COACH_MODE_VALUES as readonly string[]).includes(mode)) {
    return NextResponse.json(
      {
        error: 'Invalid mode',
        detail: `mode must be one of: ${COACH_MODE_VALUES.join(', ')}`,
      },
      { status: 400 },
    );
  }
  const scope = scopeParam === 'workshop' ? 'workshop' : undefined;

  const sessions = await listSessions({
    userId: user.userId,
    mode: (mode as CoachMode | null) ?? undefined,
    bookId: bookId ?? undefined,
    scope,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentAutobiographerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Cross-ownership safety: if a book_id is supplied, verify it belongs
  // to this user. 404 if not.
  if (parsed.data.book_id) {
    const book = await getBook(parsed.data.book_id, user.userId);
    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }
  }

  const initialMessages: CoachMessage[] = [];
  if (parsed.data.initial_message) {
    initialMessages.push({
      role: 'user',
      content: parsed.data.initial_message,
      created_at: new Date().toISOString(),
    });
  }
  const title =
    parsed.data.title ??
    (parsed.data.initial_message
      ? autoTitle(parsed.data.initial_message)
      : 'New conversation');

  const session = await createSession({
    userId: user.userId,
    mode: parsed.data.mode as (typeof COACH_MODE_VALUES)[number],
    bookId: parsed.data.book_id ?? null,
    title,
    initialMessages,
    metadata: { system_prompt_version: SYSTEM_PROMPT_VERSION },
  });

  await recordAudit({
    actorId: user.userId,
    action: 'autobiographer.coach.session_created',
    payload: {
      session_id: session.id,
      mode: session.mode,
      book_id: session.bookId,
    },
    projectId: session.bookId,
  });

  return NextResponse.json({ session }, { status: 201 });
}
