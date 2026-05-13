import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import {
  listSubscribers,
  addSubscriber,
} from '@/lib/agentic-os/creator/subscribers-repo';

const AddBody = z.object({
  email: z.string().email().max(320),
  name: z.string().max(200).optional(),
  source: z.string().max(100).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = request.nextUrl;
  const status = url.searchParams.get('status') ?? undefined;
  const search = url.searchParams.get('search') ?? undefined;
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!, 10)
    : undefined;
  const offset = url.searchParams.get('offset')
    ? parseInt(url.searchParams.get('offset')!, 10)
    : undefined;

  const subscribers = await listSubscribers(user.userId, {
    status: status as any,
    search,
    limit,
    offset,
  });

  return NextResponse.json({ subscribers });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = AddBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await addSubscriber(
    {
      email: parsed.data.email,
      name: parsed.data.name,
      source: parsed.data.source,
    },
    user.userId,
  );

  return NextResponse.json(result, { status: result.created ? 201 : 200 });
}
