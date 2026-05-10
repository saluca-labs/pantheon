import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  cloneSystemTemplate,
  getActiveConsent,
  recordAudit,
} from '@/lib/agentic-os/health/repo';

interface RouteCtx {
  params: Promise<{ id: string }>;
}

async function ensureUserAndConsent() {
  const user = await getCurrentHealthUser();
  if (!user) {
    return {
      err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    } as const;
  }
  const consent = await getActiveConsent(user.userId, user.tenantId, 'mental');
  if (!consent || !consent.granted) {
    return {
      err: NextResponse.json(
        { error: 'Mental-health consent required' },
        { status: 403 },
      ),
    } as const;
  }
  return { user } as const;
}

export async function POST(_request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const cloned = await cloneSystemTemplate(
    id,
    ok.user.tenantId,
    ok.user.userId,
  );
  if (!cloned) {
    return NextResponse.json(
      { error: 'System template not found' },
      { status: 404 },
    );
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.workout.clone',
    payload: { sourceId: id, newId: cloned.id },
  });
  return NextResponse.json({ template: cloned }, { status: 201 });
}
