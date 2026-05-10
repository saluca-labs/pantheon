import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { recordAudit } from '@/lib/agentic-os/health/repo';
import {
  deleteConversation,
  getConversation,
  listMessages,
  updateConversationTitle,
} from '@/lib/agentic-os/health/coach/repo';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  title: z.string().min(1).max(120).nullable(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const conversation = await getConversation(id, user.tenantId, user.userId);
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const messages = await listMessages({ conversationId: id, limit: 500 });
  return NextResponse.json({ conversation, messages });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const updated = await updateConversationTitle(
    id,
    user.tenantId,
    user.userId,
    parsed.data.title,
  );
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'health.coach.conversation.renamed',
    payload: { conversation_id: id },
  });
  return NextResponse.json({ conversation: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const ok = await deleteConversation(id, user.tenantId, user.userId);
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'health.coach.conversation.deleted',
    payload: { conversation_id: id },
  });
  return NextResponse.json({ ok: true });
}
