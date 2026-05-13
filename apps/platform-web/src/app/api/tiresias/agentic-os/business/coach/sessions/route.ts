/**
 * Business coach — list + create sessions.
 *
 * GET   — list current user's sessions, optional `mode` / `project_id` /
 *         `deal_id` / `scope=workshop` filters, paginated `limit` / `offset`.
 * POST  — create a new session. Returns 503 `coach_not_configured` if
 *         `ANTHROPIC_API_KEY` is missing. Audited.
 *
 * @license MIT — Tiresias Business OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  createSession,
  listSessions,
  autoTitle,
  type CoachMessage,
} from '@/lib/agentic-os/business/coach/sessions-repo';
import { COACH_MODE_VALUES } from '@/lib/agentic-os/business/coach/modes';
import { isCoachConfigured } from '@/lib/agentic-os/business/coach/anthropic';

export const dynamic = 'force-dynamic';

const CreateBody = z.object({
  mode: z.enum(COACH_MODE_VALUES as unknown as [string, ...string[]]),
  project_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(120).optional(),
  initial_message: z.string().min(1).max(8000).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const projectId = url.searchParams.get('project_id');
  const dealId = url.searchParams.get('deal_id');
  const scopeParam = url.searchParams.get('scope');
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');

  if (mode && !(COACH_MODE_VALUES as readonly string[]).includes(mode)) {
    return NextResponse.json(
      { error: 'Invalid mode', detail: `mode must be one of: ${COACH_MODE_VALUES.join(', ')}` },
      { status: 400 },
    );
  }
  const scope =
    scopeParam === 'workshop' ? 'workshop' : undefined;

  const sessions = await listSessions({
    userId: user.userId,
    mode: (mode as any) ?? undefined,
    projectId: projectId ?? undefined,
    dealId: dealId ?? undefined,
    scope,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isCoachConfigured()) {
    return NextResponse.json(
      {
        error: 'coach_not_configured',
        message: 'Business Coach is not yet configured for this environment.',
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
      : 'New conversation');

  const session = await createSession({
    userId: user.userId,
    mode: parsed.data.mode as (typeof COACH_MODE_VALUES)[number],
    projectId: parsed.data.project_id ?? null,
    dealId: parsed.data.deal_id ?? null,
    title,
    initialMessages,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'business.coach.session_created',
    payload: {
      session_id: session.id,
      mode: session.mode,
      project_id: session.projectId,
      deal_id: session.dealId,
    },
    projectId: session.projectId,
  });

  return NextResponse.json({ session }, { status: 201 });
}
