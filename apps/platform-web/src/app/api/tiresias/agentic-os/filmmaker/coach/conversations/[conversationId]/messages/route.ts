/**
 * Filmmaker coach — paginated message list for one conversation.
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import {
  getConversation,
  listMessages,
} from '@/lib/agentic-os/filmmaker/coach/repo';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ conversationId: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  const user = await getCurrentFilmmakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await params;
  const conversation = await getConversation(conversationId, user.userId);
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const url = new URL(request.url);
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');
  const before = url.searchParams.get('before') ?? undefined;
  const messages = await listMessages({
    conversationId,
    userId: user.userId,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
    before,
  });
  return NextResponse.json({ messages });
}
