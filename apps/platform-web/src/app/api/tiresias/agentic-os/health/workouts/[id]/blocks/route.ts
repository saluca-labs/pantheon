import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  addTemplateBlock,
  getActiveConsent,
  recordAudit,
  recordRiskFlag,
  reorderTemplateBlocks,
} from '@/lib/agentic-os/health/repo';
import {
  WorkoutTemplateBlockBody,
  WorkoutTemplateBlockReorderBody,
} from '@/lib/agentic-os/health/schemas';
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

export async function POST(request: NextRequest, { params }: RouteCtx) {
  const { id: templateId } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = WorkoutTemplateBlockBody.safeParse(
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
      source: 'health.workout.block.create',
      extractText: (b) => [b.notes],
      persistFlag: (flag) =>
        recordRiskFlag(ok.user.userId, ok.user.tenantId, flag).then(
          () => undefined,
        ),
    },
    () =>
      addTemplateBlock(
        templateId,
        ok.user.tenantId,
        ok.user.userId,
        parsed.data,
      ),
  );
  if (!created) {
    return NextResponse.json(
      { error: 'Template not found or not editable' },
      { status: 404 },
    );
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.workout.block.create',
    payload: { templateId, blockId: created.id },
  });
  return NextResponse.json({ block: created }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: RouteCtx) {
  const { id: templateId } = await params;
  const ok = await ensureUserAndConsent();
  if ('err' in ok) return ok.err;
  const parsed = WorkoutTemplateBlockReorderBody.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const ok2 = await reorderTemplateBlocks(
    templateId,
    ok.user.tenantId,
    ok.user.userId,
    parsed.data.orderedIds,
  );
  if (!ok2) {
    return NextResponse.json(
      { error: 'Template not found or not editable' },
      { status: 404 },
    );
  }
  await recordAudit({
    actorId: ok.user.userId,
    action: 'health.workout.block.reorder',
    payload: { templateId, count: parsed.data.orderedIds.length },
  });
  return NextResponse.json({ ok: true });
}
