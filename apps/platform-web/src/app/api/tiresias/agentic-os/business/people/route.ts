/**
 * Business OS Phase 1 — people collection route.
 *
 * GET  /api/tiresias/agentic-os/business/people
 *   List people scoped to the caller.  Default excludes archived rows.
 *   Query:
 *     ?archived=true          include archived
 *     ?tag=<value>            single-tag ANY-match (case-insensitive)
 *     ?organization_id=<uuid> scope to one org
 *     ?q=<text>               free-text search across name/email/role/notes
 *     ?limit=<n>&offset=<n>   pagination (limit 1..500)
 *
 * POST /api/tiresias/agentic-os/business/people
 *   Create a new person.  Audits `business.person.created`.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { listPeople, createPerson } from '@/lib/agentic-os/business/people-repo';

const CreateBody = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
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
});

export async function GET(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const archivedParam = url.searchParams.get('archived');
  const tagParam = url.searchParams.get('tag');
  const orgIdParam = url.searchParams.get('organization_id');
  const qParam = url.searchParams.get('q');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (orgIdParam && !/^[0-9a-f-]{36}$/i.test(orgIdParam)) {
    return NextResponse.json({ error: 'organization_id must be a UUID' }, { status: 400 });
  }

  const limit = limitParam ? Number(limitParam) : undefined;
  const offset = offsetParam ? Number(offsetParam) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 500)) {
    return NextResponse.json({ error: 'Invalid limit (1..500)' }, { status: 400 });
  }
  if (offset !== undefined && (!Number.isFinite(offset) || offset < 0)) {
    return NextResponse.json({ error: 'Invalid offset (>= 0)' }, { status: 400 });
  }

  const people = await listPeople(user.userId, {
    archived: archivedParam === 'true',
    tag: tagParam ?? undefined,
    organizationId: orgIdParam ?? undefined,
    q: qParam ?? undefined,
    limit,
    offset,
  });
  return NextResponse.json({ people });
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
  const person = await createPerson(user.userId, {
    firstName: d.first_name,
    lastName: d.last_name,
    email: d.email,
    phone: d.phone,
    role: d.role,
    organizationId: d.organization_id,
    stage: d.stage,
    tags: d.tags,
    notes: d.notes,
    descriptionMd: d.description_md,
    address: d.address,
    metadata: d.metadata,
  });
  await recordAudit({
    actorId: user.userId,
    action: 'business.person.created',
    payload: { personId: person.id },
  });
  return NextResponse.json({ person }, { status: 201 });
}
