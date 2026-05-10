import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  createWorkoutTemplate,
  getActiveConsent,
  listWorkoutTemplates,
  recordAudit,
  recordRiskFlag,
} from '@/lib/agentic-os/health/repo';
import { WorkoutTemplateBody } from '@/lib/agentic-os/health/schemas';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';

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

export async function GET(request: NextRequest) {
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? undefined;
  const category = url.searchParams.get('category') ?? undefined;
  const sourceParam = url.searchParams.get('source') ?? undefined;
  const source =
    sourceParam === 'system' || sourceParam === 'custom' ? sourceParam : 'all';
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');
  const templates = await listWorkoutTemplates({
    tenantId: ok.user.tenantId,
    userId: ok.user.userId,
    q,
    category,
    source,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest) {
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = WorkoutTemplateBody.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const created = await withCrisisGuard(
    parsed.data,
    {
      osSlug: 'health',
      source: 'health.workout.create',
      extractText: (b) => [b.description],
      persistFlag: (flag) =>
        recordRiskFlag(ok.user.userId, ok.user.tenantId, flag).then(
          () => undefined,
        ),
    },
    () => createWorkoutTemplate(ok.user.tenantId, ok.user.userId, parsed.data),
  );
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.workout.create',
    payload: { id: created.id, name: created.name, category: created.category },
  });
  return NextResponse.json({ template: created }, { status: 201 });
}
