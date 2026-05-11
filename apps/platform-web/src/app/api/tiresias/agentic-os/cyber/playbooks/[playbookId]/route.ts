import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { getPlaybook, updatePlaybook, deletePlaybook, recordAudit } from '@/lib/agentic-os/cyber/repo';
import { PLAYBOOK_LIFECYCLE_VALUES, PLAYBOOK_STEP_KIND_VALUES } from '@/lib/agentic-os/cyber/playbooks';

const PlaybookPatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.string().max(120).nullable().optional(),
  description: z.string().max(8000).nullable().optional(),
  lifecycle: z.enum(PLAYBOOK_LIFECYCLE_VALUES).optional(),
  tactic: z.string().max(120).nullable().optional(),
  steps: z.array(z.object({
    kind: z.enum(PLAYBOOK_STEP_KIND_VALUES),
    label: z.string().min(1).max(200),
    instructions: z.string().max(8000).optional(),
    fields: z.array(z.object({
      name: z.string().min(1).max(120),
      label: z.string().min(1).max(200),
      type: z.enum(['text','textarea','select','checkbox']),
      options: z.array(z.string().max(120)).max(32).optional(),
      required: z.boolean().optional(),
    })).max(32).optional(),
  })).max(64).optional(),
  tags: z.array(z.string().min(1).max(60)).max(32).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(_request: NextRequest, ctx: { params: Promise<{ playbookId: string }> }) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { playbookId } = await ctx.params;
  const playbook = await getPlaybook(playbookId, user.userId);
  if (!playbook) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ playbook });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ playbookId: string }> }) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { playbookId } = await ctx.params;
  const parsed = PlaybookPatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  const playbook = await updatePlaybook(playbookId, user.userId, parsed.data);
  if (!playbook) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({ actorId: user.userId, action: 'cyber.playbook.update', payload: { id: playbookId, patch: Object.keys(parsed.data) } });
  return NextResponse.json({ playbook });
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ playbookId: string }> }) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { playbookId } = await ctx.params;
  try {
    const success = await deletePlaybook(playbookId, user.userId);
    if (!success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({ actorId: user.userId, action: 'cyber.playbook.delete', payload: { id: playbookId } });
    return NextResponse.json({ ok: true });
  } catch (_error) {
    return NextResponse.json({ error: 'Cannot delete (foreign key constraint)' }, { status: 409 });
  }
}
