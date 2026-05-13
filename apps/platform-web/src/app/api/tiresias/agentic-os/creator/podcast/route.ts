import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { getPodcast, upsertPodcast } from '@/lib/agentic-os/creator/podcast-repo';

const UpsertBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(4000).optional(),
  author: z.string().max(200).optional(),
  coverImageUrl: z.string().max(2000).optional(),
  language: z.string().max(10).optional(),
  category: z.string().max(200).optional(),
  explicit: z.boolean().optional(),
  websiteUrl: z.string().max(2000).optional(),
});

export async function GET() {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const podcast = await getPodcast(user.userId);

  return NextResponse.json({ podcast });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = UpsertBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const podcast = await upsertPodcast(parsed.data, user.userId);

  return NextResponse.json(podcast);
}
