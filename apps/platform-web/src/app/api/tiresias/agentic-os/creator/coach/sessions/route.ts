/**
 * Creator coach — list + create sessions.
 *
 * GET   — list current user's sessions, optional `mode` filter,
 *         `?includeArchived=true` to include archived sessions.
 * POST  — create a new session. Returns 503 `coach_not_configured` if
 *         `ANTHROPIC_API_KEY` is missing. Audited.
 *
 * @license MIT — Tiresias Creator OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import {
  createSession,
  listSessions,
  autoTitle,
  type CoachMessage,
} from '@/lib/agentic-os/creator/coach/sessions-repo';
import { COACH_MODE_VALUES, type CoachMode } from '@/lib/agentic-os/creator/coach/modes';
import { isCoachConfigured } from '@/lib/agentic-os/creator/coach/anthropic';

export const dynamic = 'force-dynamic';

const CreateBody = z.object({
  mode: z.enum(COACH_MODE_VALUES as unknown as [string, ...string[]]),
  title: z.string().min(1).max(120).optional(),
  model: z.string().min(1).max(100).optional(),
  initial_message: z.string().min(1).max(8000).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const includeArchived = url.searchParams.get('includeArchived') === 'true';

  if (mode && !(COACH_MODE_VALUES as readonly string[]).includes(mode)) {
    return NextResponse.json(
      { error: 'Invalid mode', detail: `mode must be one of: ${COACH_MODE_VALUES.join(', ')}` },
      { status: 400 },
    );
  }

  const sessions = await listSessions({
    userId: user.userId,
    includeArchived,
    mode: (mode as CoachMode | null) ?? undefined,
    limit: 50,
  });
  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isCoachConfigured()) {
    return NextResponse.json(
      {
        error: 'coach_not_configured',
        message: 'Creator Coach is not yet configured for this environment.',
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
      : 'New session');

  const session = await createSession({
    userId: user.userId,
    mode: parsed.data.mode as (typeof COACH_MODE_VALUES)[number],
    title,
    model: parsed.data.model,
    initialMessages,
  });

  return NextResponse.json({ session }, { status: 201 });
}
