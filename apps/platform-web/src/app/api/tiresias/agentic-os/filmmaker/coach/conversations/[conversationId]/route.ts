/**
 * Filmmaker coach — single conversation get/patch/delete.
 *
 * GET    — conversation + the full message list (cap 500)
 * PATCH  — rename title or change mode
 * DELETE — drop the conversation (messages + action log cascade)
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { recordAudit } from '@/lib/agentic-os/filmmaker/repo';
import {
  deleteConversation,
  getConversation,
  listMessages,
  updateConversation,
} from '@/lib/agentic-os/filmmaker/coach/repo';
import { COACH_MODE_VALUES } from '@/lib/agentic-os/filmmaker/coach/modes';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ conversationId: string }>;
}

const Patch = z
  .object({
    title: z.string().min(1).max(120).nullable().optional(),
    mode: z.enum(COACH_MODE_VALUES as unknown as [string, ...string[]]).optional(),
  })
  .refine((d) => d.title !== undefined || d.mode !== undefined, {
    message: 'Provide title and/or mode.',
  });

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await params;
  const conversation = await getConversation(conversationId, user.userId);
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const messages = await listMessages({
    conversationId,
    userId: user.userId,
    limit: 500,
  });
  return NextResponse.json({ conversation, messages });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await params;
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const updated = await updateConversation(conversationId, user.userId, {
    title: parsed.data.title,
    mode: parsed.data.mode as (typeof COACH_MODE_VALUES)[number] | undefined,
  });
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.coach.conversation.update',
    payload: {
      conversation_id: conversationId,
      fields: Object.keys(parsed.data),
    },
    projectId: updated.projectId,
  });
  return NextResponse.json({ conversation: updated });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await params;
  const conversation = await getConversation(conversationId, user.userId);
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const ok = await deleteConversation(conversationId, user.userId);
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'filmmaker.coach.conversation.delete',
    payload: { conversation_id: conversationId },
    projectId: conversation.projectId,
  });
  return NextResponse.json({ ok: true });
}
