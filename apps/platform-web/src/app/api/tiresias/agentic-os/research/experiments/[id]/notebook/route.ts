/**
 * Research OS Phase 2 — Notebook entries collection route.
 *
 * `GET  /api/tiresias/agentic-os/research/experiments/:id/notebook`
 *   List entries for the experiment, ordered by entry_at DESC.
 *   Query string:
 *     - ?archived=true   include archived (default: hidden)
 *     - ?entry_kind=note filter by kind (one of the 6)
 *     - ?tag=foo         filter by single tag (case-insensitive)
 *     - ?limit=...&offset=...  pagination (limit max 500)
 *
 * `POST /api/tiresias/agentic-os/research/experiments/:id/notebook`
 *   Create a new entry. Body: { entry_kind?, title, body_md?,
 *   attached_urls?, tags?, entry_at?, metadata? }. 404 when the
 *   experiment doesn't belong to this user.
 *
 * The route uses `[id]` for the experiment slug — even though our
 * variable is `experimentId` internally — to stay consistent with the
 * Phase 1 `experiments/[id]` sibling and avoid the Next.js dynamic-
 * route collision footgun.
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import {
  isExperimentOwnedByUser,
  listNotebookEntriesForExperiment,
  createNotebookEntry,
} from '@/lib/agentic-os/research/notebook-entries-repo';
import { ENTRY_KINDS } from '@/lib/agentic-os/research/entry-kinds';

const CreateBody = z.object({
  entry_kind: z
    .enum(ENTRY_KINDS as unknown as [string, ...string[]])
    .optional(),
  title: z.string().min(1).max(300),
  body_md: z.string().max(50_000).optional(),
  attached_urls: z
    .array(z.string().url().max(4000))
    .max(50)
    .optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
  entry_at: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: experimentId } = await params;

  const owned = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!owned) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const archivedParam = url.searchParams.get('archived');
  const entryKindParam = url.searchParams.get('entry_kind');
  const tagParam = url.searchParams.get('tag');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  if (entryKindParam && !(ENTRY_KINDS as readonly string[]).includes(entryKindParam)) {
    return NextResponse.json(
      { error: `Invalid entry_kind filter: ${entryKindParam}` },
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

  const entries = await listNotebookEntriesForExperiment(experimentId, user.userId, {
    archived: archivedParam === 'true',
    entryKind: (entryKindParam ?? undefined) as any,
    tag: tagParam ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: experimentId } = await params;

  const owned = await isExperimentOwnedByUser(experimentId, user.userId);
  if (!owned) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const entry = await createNotebookEntry(experimentId, user.userId, {
    entryKind: d.entry_kind as any,
    title: d.title,
    bodyMd: d.body_md,
    attachedUrls: d.attached_urls,
    tags: d.tags,
    entryAt: d.entry_at,
    metadata: d.metadata,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'research.notebook.created',
    payload: {
      entryId: entry.id,
      experimentId,
      entryKind: entry.entryKind,
    },
    projectId: experimentId,
  });

  return NextResponse.json({ entry }, { status: 201 });
}
