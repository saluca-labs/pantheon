/**
 * Business OS Phase 1 — single interaction route.
 *
 * GET / PATCH / DELETE.  Interactions are hard-deleted (no archive
 * lifecycle) — there's no derived data depending on history; restoring a
 * "deleted call" feels wrong UX-wise.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getInteraction,
  updateInteraction,
  deleteInteraction,
} from '@/lib/agentic-os/business/interactions-repo';
import { INTERACTION_TYPES } from '@/lib/agentic-os/business/crm';

const PatchBody = z
  .object({
    person_id: z.string().uuid().nullable().optional(),
    organization_id: z.string().uuid().nullable().optional(),
    deal_id: z.string().uuid().nullable().optional(),
    interaction_type: z.enum(INTERACTION_TYPES as unknown as [string, ...string[]]).optional(),
    summary: z.string().min(1).max(2000).optional(),
    occurred_at: z.string().datetime().optional(),
  })
  .strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const interaction = await getInteraction(id, user.userId);
  if (!interaction) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ interaction });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await getInteraction(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const outcome = await updateInteraction(id, user.userId, {
    personId: d.person_id as any,
    organizationId: d.organization_id as any,
    dealId: d.deal_id as any,
    interactionType: d.interaction_type as any,
    summary: d.summary,
    occurredAt: d.occurred_at,
  });
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'business.interaction.updated',
    payload: { interactionId: id, fields: Object.keys(d) },
  });
  return NextResponse.json({ interaction: outcome.interaction });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await getInteraction(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ok = await deleteInteraction(id, user.userId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'business.interaction.deleted',
    payload: { interactionId: id },
  });
  return NextResponse.json({ ok: true });
}
