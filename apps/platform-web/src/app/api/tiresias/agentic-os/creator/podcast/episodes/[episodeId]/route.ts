import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import {
  getEpisode,
  updateEpisode,
  deleteEpisode,
} from '@/lib/agentic-os/creator/podcast-repo';

const UpdateBody = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(4000).nullable().optional(),
  notesMd: z.string().max(50000).nullable().optional(),
  audioFileUrl: z.string().max(2000).nullable().optional(),
  durationSeconds: z.number().int().min(0).nullable().optional(),
  fileSizeBytes: z.number().int().min(0).nullable().optional(),
  mimeType: z.string().max(200).nullable().optional(),
  seasonNumber: z.number().int().min(1).nullable().optional(),
  episodeNumber: z.number().int().min(1).nullable().optional(),
  episodeType: z.enum(['full', 'trailer', 'bonus']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { episodeId } = await params;
  const episode = await getEpisode(episodeId, user.userId);
  if (!episode) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(episode);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { episodeId } = await params;
  const parsed = UpdateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const outcome = await updateEpisode(episodeId, user.userId, parsed.data);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(outcome.episode);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { episodeId } = await params;
  const deleted = await deleteEpisode(episodeId, user.userId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
