import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import {
  listPeople,
  createPerson,
  createInteraction,
  recordAudit,
} from '@/lib/agentic-os/business/repo';
import { CONTACT_STAGES, INTERACTION_TYPES } from '@/lib/agentic-os/business/crm';

const PersonBody = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  role: z.string().max(200).nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  stage: z.enum(CONTACT_STAGES as unknown as [string, ...string[]]).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const InteractionBody = z.object({
  personId: z.string().uuid().nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  interactionType: z.enum(INTERACTION_TYPES as unknown as [string, ...string[]]),
  summary: z.string().min(1).max(2000),
  occurredAt: z.string().datetime().optional(),
});

export async function GET() {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const people = await listPeople(user.userId);
  return NextResponse.json({ people });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resource = request.nextUrl.searchParams.get('resource');

  if (resource === 'interactions') {
    const parsed = InteractionBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
    }
    const interaction = await createInteraction({
      userId: user.userId,
      personId: parsed.data.personId,
      organizationId: parsed.data.organizationId,
      interactionType: parsed.data.interactionType as any,
      summary: parsed.data.summary,
      occurredAt: parsed.data.occurredAt,
    });
    await recordAudit({ actorId: user.userId, action: 'business.interaction.created', payload: { id: interaction.id } });
    return NextResponse.json({ interaction }, { status: 201 });
  }

  // Default: create person
  const parsed = PersonBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }
  const person = await createPerson(user.userId, {
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    role: parsed.data.role,
    organizationId: parsed.data.organizationId,
    stage: parsed.data.stage as any,
    tags: parsed.data.tags,
    notes: parsed.data.notes,
  });
  await recordAudit({ actorId: user.userId, action: 'business.person.created', payload: { personId: person.id } });
  return NextResponse.json({ person }, { status: 201 });
}
