import { NextRequest, NextResponse } from 'next/server';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { publishEpisode } from '@/lib/agentic-os/creator/podcast-repo';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { episodeId } = await params;
  const episode = await publishEpisode(episodeId, user.userId);
  if (!episode) return NextResponse.json({ error: 'Not found or not draft' }, { status: 404 });

  return NextResponse.json(episode);
}
