/**
 * Cyber coach — list + create conversations.
 *
 * GET   — list conversations for the current user, optionally filtered by case
 * POST  — create with a given mode (and optional caseId for case-scoped chat)
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { recordAudit } from '@/lib/agentic-os/cyber/repo';
import {
  createConversation,
  listConversations,
} from '@/lib/agentic-os/cyber/coach/repo';
import { COACH_MODE_VALUES } from '@/lib/agentic-os/cyber/coach/modes';
import {
  DEFAULT_COACH_MODEL,
  getCoachModelId,
  isCoachConfigured,
} from '@/lib/agentic-os/cyber/coach/anthropic';
import { SYSTEM_PROMPT_VERSION } from '@/lib/agentic-os/cyber/coach/system-prompt';

export const dynamic = 'force-dynamic';

const CreateBody = z.object({
  mode: z.enum(COACH_MODE_VALUES as unknown as [string, ...string[]]),
  caseId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(120).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const caseId = url.searchParams.get('caseId');
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');

  const conversations = await listConversations({
    ownerId: user.userId,
    caseId: caseId ?? null,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return NextResponse.json({ conversations });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const model = isCoachConfigured() ? getCoachModelId() : DEFAULT_COACH_MODEL;
  const conversation = await createConversation({
    ownerId: user.userId,
    mode: parsed.data.mode as (typeof COACH_MODE_VALUES)[number],
    caseId: parsed.data.caseId ?? null,
    model,
    systemPromptVersion: SYSTEM_PROMPT_VERSION,
    title: parsed.data.title ?? null,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'cyber.coach.conversation.create',
    payload: {
      conversation_id: conversation.id,
      mode: conversation.mode,
      case_id: conversation.caseId,
    },
  });

  return NextResponse.json({ conversation }, { status: 201 });
}
