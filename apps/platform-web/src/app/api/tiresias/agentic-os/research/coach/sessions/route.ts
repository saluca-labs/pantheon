/**
 * Research coach — list + create sessions.
 *
 * GET   — list current user's sessions, optional `mode` / `experiment_id` /
 *         `scope=workshop` filters, paginated `limit` / `offset`.
 * POST  — create a new session. Returns 503 `coach_not_configured` if
 *         `ANTHROPIC_API_KEY` is missing. 404 if `experiment_id` doesn't
 *         belong to caller. 400 when mode=methods_advisor with no
 *         experiment_id (modeRequiresExperiment contract). Audited.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit, getExperiment } from '@/lib/agentic-os/research/repo';
import {
  createSession,
  listSessions,
  autoTitle,
  type CoachMessage,
} from '@/lib/agentic-os/research/coach/sessions-repo';
import {
  COACH_MODE_VALUES,
  modeRequiresExperiment,
  type CoachMode,
} from '@/lib/agentic-os/research/coach/modes';
import { isCoachConfigured } from '@/lib/agentic-os/research/coach/anthropic';
import { SYSTEM_PROMPT_VERSION } from '@/lib/agentic-os/research/coach/system-prompt';

export const dynamic = 'force-dynamic';

const CreateBody = z.object({
  mode: z.enum(COACH_MODE_VALUES as unknown as [string, ...string[]]),
  experiment_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(120).optional(),
  initial_message: z.string().min(1).max(8000).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const experimentId = url.searchParams.get('experiment_id');
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
    mode: (mode as any) ?? undefined,
    experimentId: experimentId ?? undefined,
    scope,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isCoachConfigured()) {
    return NextResponse.json(
      {
        error: 'coach_not_configured',
        message: 'Research Coach is not yet configured for this environment.',
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

  const mode = parsed.data.mode as CoachMode;

  // methods_advisor REQUIRES an experiment scope. Reject before we
  // burn an Anthropic call.
  if (modeRequiresExperiment(mode) && !parsed.data.experiment_id) {
    return NextResponse.json(
      {
        error: 'experiment_required',
        message: `${mode} mode requires an experiment_id.`,
      },
      { status: 400 },
    );
  }

  // Cross-ownership safety: if an experiment_id is supplied, verify it
  // belongs to this user. 404 if not.
  if (parsed.data.experiment_id) {
    const experiment = await getExperiment(parsed.data.experiment_id, user.userId);
    if (!experiment) {
      return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
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
    mode,
    experimentId: parsed.data.experiment_id ?? null,
    title,
    initialMessages,
    metadata: { system_prompt_version: SYSTEM_PROMPT_VERSION },
  });

  await recordAudit({
    actorId: user.userId,
    action: 'research.coach.session_created',
    payload: {
      session_id: session.id,
      mode: session.mode,
      experiment_id: session.experimentId,
    },
    projectId: session.experimentId,
  });

  return NextResponse.json({ session }, { status: 201 });
}
