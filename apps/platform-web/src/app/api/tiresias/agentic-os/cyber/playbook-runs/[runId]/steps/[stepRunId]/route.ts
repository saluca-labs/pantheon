import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { updateStepRun, recordAudit } from '@/lib/agentic-os/cyber/repo';
import { PLAYBOOK_STEP_RUN_STATUS_VALUES } from '@/lib/agentic-os/cyber/playbooks';

const StepRunPatchBody = z.object({
  status: z.enum(PLAYBOOK_STEP_RUN_STATUS_VALUES).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().max(8000).nullable().optional(),
});

export async function PATCH(_request: NextRequest, ctx: { params: Promise<{ runId: string; stepRunId: string }> }) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { runId, stepRunId } = await ctx.params;
  const parsed = StepRunPatchBody.safeParse(await _request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  const stepRun = await updateStepRun({ id: stepRunId, ownerId: user.userId, patch: parsed.data });
  if (!stepRun) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({ actorId: user.userId, action: 'cyber.playbook_step_run.update', payload: { id: stepRunId, runId, patch: Object.keys(parsed.data) } });
  return NextResponse.json({ stepRun });
}
