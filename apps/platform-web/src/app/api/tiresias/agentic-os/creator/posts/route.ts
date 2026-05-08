import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listPosts, createPost, updatePostStatus, recordAudit } from '@/lib/agentic-os/creator/repo';
import { POST_STATUSES, CHANNELS, CONTENT_FORMATS } from '@/lib/agentic-os/creator/calendar';

const PostBody = z.object({
  title: z.string().min(1).max(255),
  status: z.enum(POST_STATUSES as unknown as [string, ...string[]]).optional(),
  channel: z.enum(CHANNELS as unknown as [string, ...string[]]),
  contentFormat: z.enum(CONTENT_FORMATS as unknown as [string, ...string[]]),
  publishAt: z.string().datetime().nullable().optional(),
  body: z.string().max(100_000).nullable().optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
});

const StatusPatch = z.object({
  status: z.enum(POST_STATUSES as unknown as [string, ...string[]]),
});

export async function GET() {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const posts = await listPosts(user.userId);
  return NextResponse.json({ posts });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = PostBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  const post = await createPost(user.userId, {
    title: parsed.data.title,
    status: parsed.data.status as any,
    channel: parsed.data.channel as any,
    contentFormat: parsed.data.contentFormat as any,
    publishAt: parsed.data.publishAt,
    body: parsed.data.body,
    tags: parsed.data.tags,
  });

  await recordAudit({ actorId: user.userId, action: 'creator.post.created', payload: { postId: post.id } });
  return NextResponse.json({ post }, { status: 201 });
}

/** PATCH ?id=<postId> — update status */
export async function PATCH(request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const parsed = StatusPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  await updatePostStatus(id, parsed.data.status as any);
  await recordAudit({ actorId: user.userId, action: 'creator.post.status_changed', payload: { postId: id, status: parsed.data.status } });
  return NextResponse.json({ ok: true });
}
