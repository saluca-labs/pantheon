/**
 * Research OS Phase 4 — single author route.
 *
 * GET    /api/tiresias/agentic-os/research/authors/:id
 *   Author detail.
 *
 * PATCH  /api/tiresias/agentic-os/research/authors/:id
 *   Partial update. 409 on ORCID collision (per user).
 *
 * DELETE /api/tiresias/agentic-os/research/authors/:id
 *   Hard-delete. 409 if any paper still links the author
 *   (force-unlink-first contract). Audits research.author.deleted.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  getAuthor,
  updateAuthor,
  deleteAuthor,
} from '@/lib/agentic-os/research/authors-repo';

const PatchBody = z
  .object({
    display_name: z.string().min(1).max(300).optional(),
    given_name: z.string().max(200).nullable().optional(),
    family_name: z.string().max(200).nullable().optional(),
    orcid: z
      .string()
      .regex(/^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$/)
      .nullable()
      .optional(),
    affiliation: z.string().max(500).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const author = await getAuthor(id, user.userId);
  if (!author) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ author });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const existing = await getAuthor(id, user.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const outcome = await updateAuthor(id, user.userId, {
    displayName: d.display_name,
    givenName: d.given_name as any,
    familyName: d.family_name as any,
    orcid: d.orcid as any,
    affiliation: d.affiliation as any,
    metadata: d.metadata,
  });
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.kind === 'duplicate') {
    return NextResponse.json(
      { error: 'Duplicate ORCID for this user', field: outcome.field },
      { status: 409 },
    );
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.author.updated',
    payload: { authorId: id, fields: Object.keys(d) },
  });

  return NextResponse.json({ author: outcome.author });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const outcome = await deleteAuthor(id, user.userId);
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.kind === 'in_use') {
    return NextResponse.json(
      {
        error: `Author still linked to ${outcome.count} paper${outcome.count === 1 ? '' : 's'} — unlink first`,
        linkedCount: outcome.count,
      },
      { status: 409 },
    );
  }
  await recordAudit({
    actorId: user.userId,
    action: 'research.author.deleted',
    payload: { authorId: id },
  });
  return NextResponse.json({ ok: true });
}
