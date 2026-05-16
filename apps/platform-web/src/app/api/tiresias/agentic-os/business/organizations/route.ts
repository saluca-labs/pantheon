/**
 * Business OS Phase 1 — organizations collection route.
 *
 * GET  /api/tiresias/agentic-os/business/organizations
 *   List orgs scoped to the caller.  Default excludes archived rows.
 *   Query:
 *     ?archived=true   include archived
 *     ?tag=<value>     single-tag ANY-match (case-insensitive)
 *     ?industry=<name> exact match (case-insensitive)
 *     ?org_type=<one of 6>
 *     ?q=<text>        free-text across name+industry+notes
 *     ?limit=<n>&offset=<n>
 *
 * POST /api/tiresias/agentic-os/business/organizations
 *   Create.  Audits `business.org.created`.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  listOrganizations,
  createOrganization,
} from '@/lib/agentic-os/business/orgs-repo';
import { ORG_TYPES, type OrgType } from '@/lib/agentic-os/business/crm';

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  org_type: z.enum(ORG_TYPES as unknown as [string, ...string[]]).optional(),
  website: z.string().url().max(4000).nullable().optional(),
  industry: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  description_md: z.string().max(50_000).optional(),
  address: z.string().max(500).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(50).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const archivedParam = url.searchParams.get('archived');
  const tagParam = url.searchParams.get('tag');
  const industryParam = url.searchParams.get('industry');
  const orgTypeParam = url.searchParams.get('org_type');
  const qParam = url.searchParams.get('q');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (orgTypeParam && !(ORG_TYPES as readonly string[]).includes(orgTypeParam)) {
    return NextResponse.json(
      { error: `Invalid org_type filter: ${orgTypeParam}` },
      { status: 400 },
    );
  }

  const limit = limitParam ? Number(limitParam) : undefined;
  const offset = offsetParam ? Number(offsetParam) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 500)) {
    return NextResponse.json({ error: 'Invalid limit (1..500)' }, { status: 400 });
  }
  if (offset !== undefined && (!Number.isFinite(offset) || offset < 0)) {
    return NextResponse.json({ error: 'Invalid offset (>= 0)' }, { status: 400 });
  }

  const organizations = await listOrganizations(user.userId, {
    archived: archivedParam === 'true',
    tag: tagParam ?? undefined,
    industry: industryParam ?? undefined,
    orgType: (orgTypeParam ?? undefined) as OrgType | undefined,
    q: qParam ?? undefined,
    limit,
    offset,
  });
  return NextResponse.json({ organizations });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const organization = await createOrganization(user.userId, {
    name: d.name,
    orgType: d.org_type as OrgType | undefined,
    website: d.website,
    industry: d.industry,
    notes: d.notes,
    descriptionMd: d.description_md,
    address: d.address,
    tags: d.tags,
    metadata: d.metadata,
  });
  await recordAudit({
    actorId: user.userId,
    action: 'business.org.created',
    payload: { orgId: organization.id, orgType: organization.orgType },
  });
  return NextResponse.json({ organization }, { status: 201 });
}
