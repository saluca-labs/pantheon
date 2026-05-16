/**
 * Research OS Phase 4 — papers collection route.
 *
 * GET  /api/tiresias/agentic-os/research/papers
 *   Workshop-global list, ordered by updated_at DESC.
 *   Query:
 *     - ?kind=         filter by paper kind (one of the 9)
 *     - ?tag=          filter by single tag (case-insensitive, ANY match)
 *     - ?year=         filter by exact year
 *     - ?q=            free-text search across title + authors_text (ILIKE)
 *     - ?archived=true include archived rows (default: hidden)
 *     - ?limit=...&offset=...  pagination (limit max 500)
 *
 * POST /api/tiresias/agentic-os/research/papers
 *   Create a new paper. 409 on duplicate DOI / arxiv_id for this user.
 *   Audit: research.paper.created.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import { listPapers, createPaper } from '@/lib/agentic-os/research/papers-repo';
import { PAPER_KINDS, type PaperKind } from '@/lib/agentic-os/research/paper-kinds';

const CreateBody = z.object({
  title: z.string().min(1).max(500),
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
});

export async function GET(request: NextRequest) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const kindParam = url.searchParams.get('kind');
  const tagParam = url.searchParams.get('tag');
  const yearParam = url.searchParams.get('year');
  const qParam = url.searchParams.get('q');
  const archivedParam = url.searchParams.get('archived');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (kindParam && !(PAPER_KINDS as readonly string[]).includes(kindParam)) {
    return NextResponse.json(
      { error: `Invalid kind filter: ${kindParam}` },
      { status: 400 },
    );
  }

  let year: number | undefined;
  if (yearParam) {
    const y = Number(yearParam);
    if (!Number.isInteger(y) || y < 1500 || y > 2200) {
      return NextResponse.json({ error: 'Invalid year (1500..2200)' }, { status: 400 });
    }
    year = y;
  }

  const limit = limitParam ? Number(limitParam) : undefined;
  const offset = offsetParam ? Number(offsetParam) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 500)) {
    return NextResponse.json({ error: 'Invalid limit (1..500)' }, { status: 400 });
  }
  if (offset !== undefined && (!Number.isFinite(offset) || offset < 0)) {
    return NextResponse.json({ error: 'Invalid offset (>= 0)' }, { status: 400 });
  }

  const papers = await listPapers(user.userId, {
    kind: (kindParam ?? undefined) as PaperKind | undefined,
    tag: tagParam ?? undefined,
    year,
    q: qParam ?? undefined,
    archived: archivedParam === 'true',
    limit,
    offset,
  });

  return NextResponse.json({ papers });
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
  const outcome = await createPaper(user.userId, {
    title: d.title,
    kind: d.kind as PaperKind | undefined,
    doi: d.doi,
    arxivId: d.arxiv_id,
    url: d.url,
    authorsText: d.authors_text,
    venue: d.venue,
    year: d.year,
    abstractMd: d.abstract_md,
    tags: d.tags,
    metadata: d.metadata,
  });

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
    action: 'research.paper.created',
    payload: {
      paperId: outcome.paper.id,
      kind: outcome.paper.kind,
      doi: outcome.paper.doi,
      arxivId: outcome.paper.arxivId,
    },
  });

  return NextResponse.json({ paper: outcome.paper }, { status: 201 });
}
