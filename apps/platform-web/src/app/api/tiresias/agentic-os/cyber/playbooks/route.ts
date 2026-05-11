import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { listPlaybooks, createPlaybook, recordAudit } from '@/lib/agentic-os/cyber/repo';
import { PLAYBOOK_LIFECYCLE_VALUES, PLAYBOOK_STEP_KIND_VALUES, type PlaybookLifecycle } from '@/lib/agentic-os/cyber/playbooks';

const PlaybookBody = z.object({
  name: z.string().min(1).max(200),
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

export async function GET(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const lifecycleRaw = searchParams.get('lifecycle');
  const lifecycle =
    lifecycleRaw && (PLAYBOOK_LIFECYCLE_VALUES as readonly string[]).includes(lifecycleRaw)
      ? (lifecycleRaw as PlaybookLifecycle)
      : undefined;
  const q = searchParams.get('q') ?? undefined;
  const playbooks = await listPlaybooks({ ownerId: user.userId, lifecycle, q });
  return NextResponse.json({ playbooks });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentCyberUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = PlaybookBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  const playbook = await createPlaybook(user.userId, parsed.data);
  await recordAudit({ actorId: user.userId, action: 'cyber.playbook.create', payload: { id: playbook.id, lifecycle: playbook.lifecycle } });
  return NextResponse.json({ playbook }, { status: 201 });
}
