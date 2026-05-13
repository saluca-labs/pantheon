import { NextRequest, NextResponse } from 'next/server';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { publishPost } from '@/lib/agentic-os/creator/posts-repo';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;
  const post = await publishPost(postId, user.userId);
  if (!post) {
    return NextResponse.json(
      { error: 'Post not found or cannot be published (must be draft or scheduled)' },
      { status: 400 },
    );
  }

  return NextResponse.json({ post });
}
