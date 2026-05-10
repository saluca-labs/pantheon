import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  deleteMoodEntry,
  getActiveConsent,
  getMoodEntry,
  recordAudit,
  recordRiskFlag,
  updateMoodEntry,
} from '@/lib/agentic-os/health/repo';
import { MoodEntryUpdateBody } from '@/lib/agentic-os/health/schemas';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';

/**
 * GET    — fetch a single mood entry (with tags).
 * PATCH  — partial update; crisis-guard runs over `notes`.
 * DELETE — remove. CASCADE handles entry-tag join cleanup.
 *
 * Mental-scope consent is required for any mutation; reads gate too
 * for consistency with the list endpoint.
 */

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

export async function GET(_request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const entry = await getMoodEntry(id, ok.user.userId);
  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ entry });
}

export async function PATCH(request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = MoodEntryUpdateBody.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const updated = await withCrisisGuard(
    parsed.data,
    {
      osSlug: 'health',
      source: 'mood-entry',
      extractText: (b) => [b.notes],
      persistFlag: (flag) =>
        recordRiskFlag(ok.user.userId, ok.user.tenantId, flag).then(() =>
          undefined,
        ),
    },
    () => updateMoodEntry(id, ok.user.userId, parsed.data),
  );
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.mood.updated',
    payload: { id, fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ entry: updated });
}

export async function DELETE(_request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const deleted = await deleteMoodEntry(id, ok.user.userId);
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.mood.deleted',
    payload: { id },
  });
  return NextResponse.json({ ok: true });
}
