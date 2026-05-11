import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { getPlaybookRun, completeRun, recordAudit } from '@/lib/agentic-os/cyber/repo';

export async function GET(_request: NextRequest, ctx: { params: Promise<{ runId: string }> }) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { runId } = await ctx.params;
  const run = await getPlaybookRun(runId, user.userId);
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ run });
}

const CompleteRunBody = z.object({
  status: z.enum(['completed', 'abandoned'] as const),
  notes: z.string().max(8000).nullable().optional(),
});

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ runId: string }> }) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { runId } = await ctx.params;
  const parsed = CompleteRunBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  const run = await completeRun({ runId, ownerId: user.userId, status: parsed.data.status, notes: parsed.data.notes });
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ run });
}
