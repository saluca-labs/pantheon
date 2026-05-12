/**
 * Research OS Phase 4 — paper-authors collection route.
 *
 * GET  /api/tiresias/agentic-os/research/papers/:id/authors
 *   Ordered list of authors for the paper.
 *
 * POST /api/tiresias/agentic-os/research/papers/:id/authors
 *   Link an author. Body shape (one of):
 *     - { authorId: UUID, position?: number } — link existing author
 *     - { displayName: string, givenName?, familyName?, orcid?,
 *         affiliation?, position?: number } — auto-create + link
 *
 *   Position defaults to the next available slot (max + 1). 409 on
 *   duplicate (paper, author) or position collision. Audits
 *   research.author.created (only if auto-created) +
 *   research.paper.author.linked.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  isPaperOwnedByUser,
  isAuthorOwnedByUser,
  listOrderedAuthorsForPaper,
  linkExistingAuthor,
} from '@/lib/agentic-os/research/paper-authors-repo';
import { createAuthor } from '@/lib/agentic-os/research/authors-repo';

const LinkBody = z
  .object({
    authorId: z.string().uuid().optional(),
    displayName: z.string().min(1).max(300).optional(),
    givenName: z.string().max(200).nullable().optional(),
    familyName: z.string().max(200).nullable().optional(),
    orcid: z
      .string()
      .regex(/^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$/)
      .nullable()
      .optional(),
    affiliation: z.string().max(500).nullable().optional(),
    position: z.number().int().min(1).max(1000).optional(),
  })
  .strict()
  .refine(
    (v) => v.authorId !== undefined || (v.displayName !== undefined && v.displayName.length > 0),
    { message: 'Either authorId or displayName is required' },
  );

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: paperId } = await params;
  const owned = await isPaperOwnedByUser(paperId, user.userId);
  if (!owned) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const authors = await listOrderedAuthorsForPaper(paperId, user.userId);
  return NextResponse.json({ authors });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: paperId } = await params;

  const owned = await isPaperOwnedByUser(paperId, user.userId);
  if (!owned) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const parsed = LinkBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  let authorId: string;
  let autoCreated = false;
  if (d.authorId) {
    const ownsAuthor = await isAuthorOwnedByUser(d.authorId, user.userId);
    if (!ownsAuthor) {
      return NextResponse.json({ error: 'Author not found' }, { status: 404 });
    }
    authorId = d.authorId;
  } else {
    const outcome = await createAuthor(user.userId, {
      displayName: d.displayName!,
      givenName: d.givenName ?? null,
      familyName: d.familyName ?? null,
      orcid: d.orcid ?? null,
      affiliation: d.affiliation ?? null,
    });
    if (outcome.kind === 'duplicate') {
      return NextResponse.json(
        {
          error: 'Duplicate author ORCID for this user',
          field: outcome.field,
        },
        { status: 409 },
      );
    }
    authorId = outcome.author.id;
    autoCreated = true;
    await recordAudit({
      actorId: user.userId,
      action: 'research.author.created',
      payload: {
        authorId,
        autoCreatedFor: { paperId },
      },
    });
  }

  const linkOutcome = await linkExistingAuthor(paperId, authorId, d.position);
  if (linkOutcome.kind === 'duplicate_author') {
    return NextResponse.json(
      { error: 'This author is already linked to this paper' },
      { status: 409 },
    );
  }
  if (linkOutcome.kind === 'duplicate_position') {
    return NextResponse.json(
      { error: `Position ${d.position} is already taken on this paper` },
      { status: 409 },
    );
  }
  if (linkOutcome.kind === 'invalid_position') {
    return NextResponse.json({ error: 'Position must be >= 1' }, { status: 400 });
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.paper.author.linked',
    payload: {
      paperId,
      authorId,
      position: linkOutcome.link.position,
      autoCreated,
    },
  });

  return NextResponse.json(
    { link: linkOutcome.link, authorId, autoCreated },
    { status: 201 },
  );
}
