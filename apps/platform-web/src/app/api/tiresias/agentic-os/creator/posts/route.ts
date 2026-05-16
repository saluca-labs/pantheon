import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listPosts, createPost } from '@/lib/agentic-os/creator/posts-repo';
import { POST_STATUSES, type PostStatus } from '@/lib/agentic-os/creator/posts';

const CreateBody = z.object({
  title: z.string().min(1).max(500),
  slug: z.string().max(200).optional(),
  excerpt: z.string().max(500).optional(),
  content: z.record(z.unknown()).optional(),
  coverImageUrl: z.string().max(2000).optional(),
  status: z.enum(POST_STATUSES as unknown as [string, ...string[]]).optional(),
  scheduledAt: z.string().datetime().optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = request.nextUrl;
  const statusParam = url.searchParams.get('status');
  const search = url.searchParams.get('search') ?? undefined;
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!, 10)
    : undefined;
  const offset = url.searchParams.get('offset')
    ? parseInt(url.searchParams.get('offset')!, 10)
    : undefined;

  const status = statusParam
    ? (statusParam.split(',') as readonly string[])
    : undefined;

  const posts = await listPosts(user.userId, {
    status: status as PostStatus[] | undefined,
    search,
    limit,
    offset,
  });

  return NextResponse.json({ posts });
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

  const post = await createPost(
    {
      title: parsed.data.title,
      slug: parsed.data.slug,
      excerpt: parsed.data.excerpt,
      content: parsed.data.content,
      coverImageUrl: parsed.data.coverImageUrl,
      status: parsed.data.status as PostStatus,
      scheduledAt: parsed.data.scheduledAt,
      tags: parsed.data.tags,
    },
    user.userId,
  );

  return NextResponse.json({ post }, { status: 201 });
}
