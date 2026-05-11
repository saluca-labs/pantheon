import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { replacePlaybookSteps, recordAudit } from '@/lib/agentic-os/cyber/repo';
import { PLAYBOOK_STEP_KIND_VALUES } from '@/lib/agentic-os/cyber/playbooks';

const StepsBody = z.object({
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
  })).max(64),
});

export async function PUT(request: NextRequest, ctx: { params: Promise<{ playbookId: string }> }) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { playbookId } = await ctx.params;
  const parsed = StepsBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  const playbook = await replacePlaybookSteps({ id: playbookId, ownerId: user.userId, steps: parsed.data.steps });
  if (!playbook) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({ actorId: user.userId, action: 'cyber.playbook.steps_replace', payload: { id: playbookId, stepCount: parsed.data.steps.length } });
  return NextResponse.json({ playbook });
}
