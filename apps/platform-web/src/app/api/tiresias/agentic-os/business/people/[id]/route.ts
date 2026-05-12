/**
 * Business OS Phase 1 — single person route.
 *
 * GET    /api/tiresias/agentic-os/business/people/[id]
 * PATCH  /api/tiresias/agentic-os/business/people/[id]
 *   Partial update.  `archived: true` soft-archives (audits as
 *   `business.person.archived`).  `archived: false` is rejected with a
 *   pointer to the restore endpoint.
 * DELETE /api/tiresias/agentic-os/business/people/[id]
 *   Soft-archive (no hard delete).  Audits `business.person.archived`.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getPerson,
  updatePerson,
  archivePerson,
} from '@/lib/agentic-os/business/people-repo';

const PatchBody = z
  .object({
    first_name: z.string().min(1).max(100).optional(),
    last_name: z.string().min(1).max(100).optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
    role: z.string().max(200).nullable().optional(),
    organization_id: z.string().uuid().nullable().optional(),
    stage: z.string().max(60).optional(),
    tags: z.array(z.string().min(1).max(60)).max(50).optional(),
    notes: z.string().max(5000).nullable().optional(),
    description_md: z.string().max(50_000).optional(),
    address: z.string().max(500).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const person = await getPerson(id, user.userId);
  if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ person });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getPerson(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  if (d.archived === true) {
    const archived = await archivePerson(id, user.userId);
    if (!archived) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'business.person.archived',
      payload: { personId: id },
    });
    return NextResponse.json({ person: archived });
  }
  if (d.archived === false) {
    return NextResponse.json(
      {
        error: 'Use POST /people/[id]/restore to un-archive',
        restorePath: `/api/tiresias/agentic-os/business/people/${id}/restore`,
      },
      { status: 400 },
    );
  }

  const { archived: _drop, ...rest } = d;
  const outcome = await updatePerson(id, user.userId, {
    firstName: rest.first_name,
    lastName: rest.last_name,
    email: rest.email as any,
    phone: rest.phone as any,
    role: rest.role as any,
    organizationId: rest.organization_id as any,
    stage: rest.stage,
    tags: rest.tags,
    notes: rest.notes as any,
    descriptionMd: rest.description_md,
    address: rest.address as any,
    metadata: rest.metadata,
  });
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'business.person.updated',
    payload: { personId: id, fields: Object.keys(rest) },
  });
  return NextResponse.json({ person: outcome.person });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await getPerson(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const archived = await archivePerson(id, user.userId);
  if (!archived) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'business.person.archived',
    payload: { personId: id },
  });
  return NextResponse.json({ person: archived });
}
