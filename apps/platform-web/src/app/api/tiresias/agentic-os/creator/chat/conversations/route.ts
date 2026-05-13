import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listConversations, createConversation } from '@/lib/agentic-os/creator/chat-repo';

const CreateBody = z.object({
  title: z.string().min(1).max(500).optional(),
  model: z.string().max(100).optional(),
  systemPrompt: z.string().max(8000).nullable().optional(),
});

export async function GET(_request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const conversations = await listConversations(user.userId);
  return NextResponse.json({ conversations });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const conversation = await createConversation(
    {
      title: parsed.data.title,
      model: parsed.data.model,
      systemPrompt: parsed.data.systemPrompt ?? null,
    },
    user.userId,
  );

  return NextResponse.json({ conversation }, { status: 201 });
}
