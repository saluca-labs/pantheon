import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getConversation,
  listMessages,
} from '@/lib/agentic-os/health/coach/repo';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
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
  const url = new URL(request.url);
  const limit = url.searchParams.get('limit');
  const before = url.searchParams.get('before') ?? undefined;
  const messages = await listMessages({
    conversationId: id,
    limit: limit ? Number(limit) : undefined,
    before,
  });
  return NextResponse.json({ messages });
}
