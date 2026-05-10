import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  deleteWorkoutTemplate,
  getActiveConsent,
  getWorkoutTemplate,
  recordAudit,
  recordRiskFlag,
  updateWorkoutTemplate,
} from '@/lib/agentic-os/health/repo';
import { WorkoutTemplateUpdateBody } from '@/lib/agentic-os/health/schemas';
import { withCrisisGuard } from '@/lib/agentic-os/_shared/safety/crisis-guard';

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
  const template = await getWorkoutTemplate(id, ok.user.tenantId, ok.user.userId);
  if (!template) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ template });
}

export async function PATCH(request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = WorkoutTemplateUpdateBody.safeParse(
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
      source: 'health.workout.update',
      extractText: (b) => [b.description],
      persistFlag: (flag) =>
        recordRiskFlag(ok.user.userId, ok.user.tenantId, flag).then(
          () => undefined,
        ),
    },
    () =>
      updateWorkoutTemplate(id, ok.user.tenantId, ok.user.userId, parsed.data),
  );
  if (!updated) {
    return NextResponse.json(
      { error: 'Not found or not editable (system templates are read-only)' },
      { status: 404 },
    );
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.workout.update',
    payload: { id, fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ template: updated });
}

export async function DELETE(_request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const deleted = await deleteWorkoutTemplate(
    id,
    ok.user.tenantId,
    ok.user.userId,
  );
  if (!deleted) {
    return NextResponse.json(
      { error: 'Not found or not deletable (system templates are read-only)' },
      { status: 404 },
    );
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.workout.delete',
    payload: { id },
  });
  return NextResponse.json({ ok: true });
}
