import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import {
  getConversation,
  updateConversation,
  deleteConversation,
} from '@/lib/agentic-os/creator/chat-repo';

const PatchBody = z.object({
  title: z.string().min(1).max(500).optional(),
  model: z.string().max(100).optional(),
  systemPrompt: z.string().max(8000).nullable().optional(),
});

interface Props {
  params: Promise<{ conversationId: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await params;
  const conversation = await getConversation(conversationId, user.userId);
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ conversation });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await params;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await updateConversation(conversationId, user.userId, {
    title: parsed.data.title,
    model: parsed.data.model,
    systemPrompt: parsed.data.systemPrompt,
  });

  if (result.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ conversation: result.conversation });
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await params;
  const deleted = await deleteConversation(conversationId, user.userId);
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
