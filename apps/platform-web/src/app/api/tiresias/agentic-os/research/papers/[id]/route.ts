/**
 * Research OS Phase 4 — single paper route.
 *
 * GET    /api/tiresias/agentic-os/research/papers/:id
 *   Hydrated paper row: paper + ordered authors + linked-experiment count.
 *
 * PATCH  /api/tiresias/agentic-os/research/papers/:id
 *   Partial update. Supports `archived: true` to soft-archive (audits as
 *   research.paper.archived, NOT research.paper.updated). `archived:
 *   false` is rejected with a 400 pointing at the restore route.
 *
 * DELETE /api/tiresias/agentic-os/research/papers/:id
 *   Soft-archive. Sets archived_at. Audits research.paper.archived.
 *   There is NO hard-delete path per spec.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  getPaper,
  updatePaper,
  archivePaper,
  countLinkedExperimentsForPaper,
} from '@/lib/agentic-os/research/papers-repo';
import { listOrderedAuthorsForPaper } from '@/lib/agentic-os/research/paper-authors-repo';
import { PAPER_KINDS, type PaperKind } from '@/lib/agentic-os/research/paper-kinds';

const PatchBody = z
  .object({
    title: z.string().min(1).max(500).optional(),
    kind: z.enum(PAPER_KINDS as unknown as [string, ...string[]]).optional(),
    doi: z.string().max(200).nullable().optional(),
    arxiv_id: z.string().max(50).nullable().optional(),
    url: z.string().url().max(4000).nullable().optional(),
    authors_text: z.string().max(2000).nullable().optional(),
    venue: z.string().max(500).nullable().optional(),
    year: z.number().int().min(1500).max(2200).nullable().optional(),
    abstract_md: z.string().max(50_000).nullable().optional(),
    tags: z.array(z.string().min(1).max(60)).max(50).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    archived: z.boolean().optional(),
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
  const paper = await getPaper(id, user.userId);
  if (!paper) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const [authors, linkedExperimentsCount] = await Promise.all([
    listOrderedAuthorsForPaper(id, user.userId),
    countLinkedExperimentsForPaper(id, user.userId),
  ]);
  return NextResponse.json({ paper, authors, linkedExperimentsCount });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const existing = await getPaper(id, user.userId);
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

  // Archive lifecycle: archived=true => soft-archive; archived=false =>
  // pointer at the restore route.
  if (d.archived === true) {
    const archived = await archivePaper(id, user.userId);
    if (!archived) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await recordAudit({
      actorId: user.userId,
      action: 'research.paper.archived',
      payload: { paperId: id },
    });
    return NextResponse.json({ paper: archived });
  }
  if (d.archived === false) {
    return NextResponse.json(
      {
        error: 'Use POST /papers/[id]/restore to un-archive',
        restorePath: `/api/tiresias/agentic-os/research/papers/${id}/restore`,
      },
      { status: 400 },
    );
  }

  const { archived: _drop, ...rest } = d;
  const outcome = await updatePaper(id, user.userId, {
    title: rest.title,
    kind: rest.kind as PaperKind | undefined,
    doi: rest.doi,
    arxivId: rest.arxiv_id,
    url: rest.url,
    authorsText: rest.authors_text,
    venue: rest.venue,
    year: rest.year,
    abstractMd: rest.abstract_md,
    tags: rest.tags,
    metadata: rest.metadata,
  });

  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.kind === 'duplicate') {
    return NextResponse.json(
      {
        error: `Duplicate ${outcome.field === 'arxiv_id' ? 'arXiv ID' : 'DOI'} for this user`,
        field: outcome.field,
      },
      { status: 409 },
    );
  }

  await recordAudit({
    actorId: user.userId,
    action: 'research.paper.updated',
    payload: { paperId: id, fields: Object.keys(rest) },
  });

  return NextResponse.json({ paper: outcome.paper });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const existing = await getPaper(id, user.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const archived = await archivePaper(id, user.userId);
  if (!archived) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await recordAudit({
    actorId: user.userId,
    action: 'research.paper.archived',
    payload: { paperId: id },
  });
  return NextResponse.json({ paper: archived });
}
