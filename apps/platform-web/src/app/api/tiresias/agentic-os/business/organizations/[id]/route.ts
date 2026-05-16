/**
 * Business OS Phase 1 — single organization route.
 *
 * GET / PATCH / DELETE — same shape as people/[id].
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getOrganization,
  updateOrganization,
  archiveOrganization,
  countActivePeopleForOrganization,
} from '@/lib/agentic-os/business/orgs-repo';
import { ORG_TYPES, type OrgType } from '@/lib/agentic-os/business/crm';

const PatchBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    org_type: z.enum(ORG_TYPES as unknown as [string, ...string[]]).optional(),
    website: z.string().url().max(4000).nullable().optional(),
    industry: z.string().max(200).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    description_md: z.string().max(50_000).optional(),
    address: z.string().max(500).nullable().optional(),
    tags: z.array(z.string().min(1).max(60)).max(50).optional(),
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
  const organization = await getOrganization(id, user.userId);
  if (!organization) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const activePeopleCount = await countActivePeopleForOrganization(id, user.userId);
  return NextResponse.json({ organization, activePeopleCount });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await getOrganization(id, user.userId);
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
    const archived = await archiveOrganization(id, user.userId);
    if (!archived) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await recordAudit({
      actorId: user.userId,
      action: 'business.org.archived',
      payload: { orgId: id },
    });
    return NextResponse.json({ organization: archived });
  }
  if (d.archived === false) {
    return NextResponse.json(
      {
        error: 'Use POST /organizations/[id]/restore to un-archive',
        restorePath: `/api/tiresias/agentic-os/business/organizations/${id}/restore`,
      },
      { status: 400 },
    );
  }

  const { archived: _drop, ...rest } = d;
  const outcome = await updateOrganization(id, user.userId, {
    name: rest.name,
    orgType: rest.org_type as OrgType | undefined,
    website: rest.website,
    industry: rest.industry,
    notes: rest.notes,
    descriptionMd: rest.description_md,
    address: rest.address,
    tags: rest.tags,
    metadata: rest.metadata,
  });
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'business.org.updated',
    payload: { orgId: id, fields: Object.keys(rest) },
  });
  return NextResponse.json({ organization: outcome.org });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await getOrganization(id, user.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const archived = await archiveOrganization(id, user.userId);
  if (!archived) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'business.org.archived',
    payload: { orgId: id },
  });
  return NextResponse.json({ organization: archived });
}
