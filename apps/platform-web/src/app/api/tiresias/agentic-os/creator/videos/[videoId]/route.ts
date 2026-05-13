import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { getVideo, updateVideo, deleteVideo } from '@/lib/agentic-os/creator/video-repo';

const UpdateBody = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  url: z.string().min(1).max(5000).optional(),
  thumbnailUrl: z.string().max(2000).nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  status: z.enum(['processing', 'ready', 'failed']).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { videoId } = await params;
  const video = await getVideo(videoId, user.userId);
  if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(video);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { videoId } = await params;
  const parsed = UpdateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const outcome = await updateVideo(videoId, user.userId, parsed.data);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(outcome.video);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { videoId } = await params;
  const deleted = await deleteVideo(videoId, user.userId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
