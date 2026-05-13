import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listEpisodes, createEpisode } from '@/lib/agentic-os/creator/podcast-repo';
import type { EpisodeType, EpisodeStatus } from '@/lib/agentic-os/creator/podcast';

const CreateBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(4000).optional(),
  notesMd: z.string().max(50000).optional(),
  audioFileUrl: z.string().max(2000).optional(),
  durationSeconds: z.number().int().min(0).optional(),
  fileSizeBytes: z.number().int().min(0).optional(),
  mimeType: z.string().max(200).optional(),
  seasonNumber: z.number().int().min(1).optional(),
  episodeNumber: z.number().int().min(1).optional(),
  episodeType: z.enum(['full', 'trailer', 'bonus']).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = request.nextUrl;
  const seasonNumber = url.searchParams.get('seasonNumber')
    ? parseInt(url.searchParams.get('seasonNumber')!, 10)
    : undefined;
  const status = url.searchParams.get('status') as EpisodeStatus | undefined;
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!, 10)
    : undefined;
  const offset = url.searchParams.get('offset')
    ? parseInt(url.searchParams.get('offset')!, 10)
    : undefined;

  const episodes = await listEpisodes(user.userId, {
    seasonNumber,
    status,
    limit,
    offset,
  });

  return NextResponse.json({ episodes });
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

  const episode = await createEpisode(parsed.data, user.userId);

  return NextResponse.json(episode, { status: 201 });
}
