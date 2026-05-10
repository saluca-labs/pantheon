import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  createMoodTag,
  getActiveConsent,
  listMoodTags,
  recordAudit,
} from '@/lib/agentic-os/health/repo';
import { MoodTagBody } from '@/lib/agentic-os/health/schemas';

/**
 * GET  — list mood tags for the current user (auto-seeds the starter
 *        set on first access — see `listMoodTags` in repo).
 * POST — create or upsert a tag (unique on user_id + name).
 *
 * Mental-scope consent is required.
 */
export async function GET() {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const consent = await getActiveConsent(user.userId, user.tenantId, 'mental');
  if (!consent || !consent.granted) {
    return NextResponse.json(
      { error: 'Mental-health consent required' },
      { status: 403 },
    );
  }
  const tags = await listMoodTags(user.userId, user.tenantId);
  return NextResponse.json({ tags });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const consent = await getActiveConsent(user.userId, user.tenantId, 'mental');
  if (!consent || !consent.granted) {
    return NextResponse.json(
      { error: 'Mental-health consent required' },
      { status: 403 },
    );
  }
  const parsed = MoodTagBody.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const tag = await createMoodTag(
    user.userId,
    user.tenantId,
    parsed.data.name,
    parsed.data.color ?? null,
  );
  await recordAudit({
    actorId: user.userId,
    action: 'health.mood_tag.created',
    payload: { id: tag.id, name: tag.name },
  });
  return NextResponse.json({ tag }, { status: 201 });
}
