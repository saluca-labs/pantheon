import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import {
  getPost,
  updatePost,
  deletePost,
} from '@/lib/agentic-os/creator/posts-repo';
import { POST_STATUSES, type UpdateCreatorPostInput } from '@/lib/agentic-os/creator/posts';

const UpdateBody = z.object({
  title: z.string().min(1).max(500).optional(),
  slug: z.string().max(200).optional(),
  excerpt: z.string().max(500).nullable().optional(),
  content: z.record(z.unknown()).optional(),
  coverImageUrl: z.string().max(2000).nullable().optional(),
  status: z.enum(POST_STATUSES as unknown as [string, ...string[]]).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;
  const post = await getPost(postId, user.userId);
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(post);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;
  const parsed = UpdateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const outcome = await updatePost(postId, user.userId, parsed.data as UpdateCreatorPostInput);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(outcome.post);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;
  const deleted = await deletePost(postId, user.userId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
