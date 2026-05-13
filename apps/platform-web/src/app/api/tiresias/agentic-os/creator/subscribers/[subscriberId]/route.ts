import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import {
  updateSubscriberStatus,
  deleteSubscriber,
} from '@/lib/agentic-os/creator/subscribers-repo';
import { SUBSCRIBER_STATUSES, type SubscriberStatus } from '@/lib/agentic-os/creator/subscribers';

const StatusPatch = z.object({
  status: z.enum(SUBSCRIBER_STATUSES as unknown as [string, ...string[]]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ subscriberId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { subscriberId } = await params;
  const parsed = StatusPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const sub = await updateSubscriberStatus(
    subscriberId,
    parsed.data.status as SubscriberStatus,
    user.userId,
  );
  if (!sub) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(sub);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ subscriberId: string }> },
) {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { subscriberId } = await params;
  const deleted = await deleteSubscriber(subscriberId, user.userId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
