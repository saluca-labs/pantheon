import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listVideos, createVideo } from '@/lib/agentic-os/creator/video-repo';

const CreateBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  url: z.string().min(1).max(5000),
  thumbnailUrl: z.string().max(2000).optional(),
  durationSeconds: z.number().int().positive().optional(),
  status: z.enum(['processing', 'ready', 'failed']).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = request.nextUrl;
  const statusParam = url.searchParams.get('status');
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!, 10)
    : undefined;
  const offset = url.searchParams.get('offset')
    ? parseInt(url.searchParams.get('offset')!, 10)
    : undefined;

  const videos = await listVideos(user.userId, {
    status: (statusParam as 'processing' | 'ready' | 'failed') ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({ videos });
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

  const video = await createVideo(
    {
      title: parsed.data.title,
      description: parsed.data.description,
      url: parsed.data.url,
      thumbnailUrl: parsed.data.thumbnailUrl,
      durationSeconds: parsed.data.durationSeconds,
      status: parsed.data.status,
    },
    user.userId,
  );

  return NextResponse.json(video, { status: 201 });
}
