import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { startPlaybookRun, recordAudit } from '@/lib/agentic-os/cyber/repo';

const StartRunBody = z.object({
  caseId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ playbookId: string }> }) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { playbookId } = await ctx.params;
  const parsed = StartRunBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  const run = await startPlaybookRun({ ownerId: user.userId, playbookId, caseId: parsed.data.caseId ?? null });
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({ actorId: user.userId, action: 'cyber.playbook_run.start', payload: { id: run.id, playbookId, caseId: run.caseId } });
  return NextResponse.json({ run }, { status: 201 });
}
