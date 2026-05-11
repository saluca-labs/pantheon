/**
 * Filmmaker coach — list + create conversations for one project.
 *
 * GET    — list conversations sorted by updated_at desc
 * POST   — create with a given mode; returns the new conversation
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { getProject, recordAudit } from '@/lib/agentic-os/filmmaker/repo';
import {
  createConversation,
  listConversations,
} from '@/lib/agentic-os/filmmaker/coach/repo';
import { COACH_MODE_VALUES } from '@/lib/agentic-os/filmmaker/coach/modes';
import {
  DEFAULT_COACH_MODEL,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/filmmaker/coach/anthropic';
import { SYSTEM_PROMPT_VERSION } from '@/lib/agentic-os/filmmaker/coach/system-prompt';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

const CreateBody = z.object({
  mode: z.enum(COACH_MODE_VALUES as unknown as [string, ...string[]]),
  title: z.string().min(1).max(120).nullable().optional(),
});

export async function GET(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId } = await params;
  const project = await getProject(projectId, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(request.url);
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');

  const conversations = await listConversations({
    projectId,
    userId: user.userId,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return NextResponse.json({ conversations });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId } = await params;
  const project = await getProject(projectId, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const model = isCoachConfigured() ? getCoachModelId() : DEFAULT_COACH_MODEL;
  const conversation = await createConversation({
    projectId,
    userId: user.userId,
    mode: parsed.data.mode as (typeof COACH_MODE_VALUES)[number],
    model,
    systemPromptVersion: SYSTEM_PROMPT_VERSION,
    title: parsed.data.title ?? null,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.coach.conversation.create',
    payload: { conversation_id: conversation.id, mode: conversation.mode },
    projectId,
  });

  return NextResponse.json({ conversation }, { status: 201 });
}
