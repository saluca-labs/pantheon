/**
 * Research OS Phase 4 — authors collection route.
 *
 * GET  /api/tiresias/agentic-os/research/authors
 *   Workshop-global list. Query:
 *     - ?family_name_prefix=  filter by family-name prefix (case-insensitive)
 *     - ?q=                   free-text search across display_name
 *     - ?limit=, ?offset=     pagination (limit max 1000)
 *
 * POST /api/tiresias/agentic-os/research/authors
 *   Create a new author. 409 on duplicate ORCID for this user.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import { listAuthors, createAuthor } from '@/lib/agentic-os/research/authors-repo';

const CreateBody = z.object({
  display_name: z.string().min(1).max(300),
  given_name: z.string().max(200).nullable().optional(),
  family_name: z.string().max(200).nullable().optional(),
  orcid: z
    .string()
    .regex(/^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$/)
    .nullable()
    .optional(),
  affiliation: z.string().max(500).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const familyNamePrefix = url.searchParams.get('family_name_prefix');
  const q = url.searchParams.get('q');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  const limit = limitParam ? Number(limitParam) : undefined;
  const offset = offsetParam ? Number(offsetParam) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 1000)) {
    return NextResponse.json({ error: 'Invalid limit (1..1000)' }, { status: 400 });
  }
  if (offset !== undefined && (!Number.isFinite(offset) || offset < 0)) {
    return NextResponse.json({ error: 'Invalid offset (>= 0)' }, { status: 400 });
  }

  const authors = await listAuthors(user.userId, {
    familyNamePrefix: familyNamePrefix ?? undefined,
    q: q ?? undefined,
    limit,
    offset,
  });
  return NextResponse.json({ authors });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const outcome = await createAuthor(user.userId, {
    displayName: d.display_name,
    givenName: d.given_name,
    familyName: d.family_name,
    orcid: d.orcid,
    affiliation: d.affiliation,
    metadata: d.metadata,
  });
  if (outcome.kind === 'duplicate') {
    return NextResponse.json(
      { error: 'Duplicate ORCID for this user', field: outcome.field },
      { status: 409 },
    );
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.author.created',
    payload: {
      authorId: outcome.author.id,
      orcid: outcome.author.orcid,
    },
  });

  return NextResponse.json({ author: outcome.author }, { status: 201 });
}
