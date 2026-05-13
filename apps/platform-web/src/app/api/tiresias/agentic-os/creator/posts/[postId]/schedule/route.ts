import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { schedulePost } from '@/lib/agentic-os/creator/posts-repo';

const ScheduleBody = z.object({
  scheduledAt: z.string().datetime(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;
  const parsed = ScheduleBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const post = await schedulePost(postId, user.userId, parsed.data.scheduledAt);
  if (!post) {
    return NextResponse.json(
      { error: 'Post not found or cannot be scheduled (must be draft or idea)' },
      { status: 400 },
    );
  }

  return NextResponse.json({ post });
}
